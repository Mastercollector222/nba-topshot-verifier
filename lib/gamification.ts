/**
 * lib/gamification.ts
 * ---------------------------------------------------------------------------
 * Idempotent TSR point awards for engagement actions.
 *
 * All awards are inserted into `tsr_adjustments` with a `reason_key`. A
 * partial unique index on (flow_address, reason_key) prevents double-credit
 * at the DB level, so it is safe to call these functions redundantly.
 *
 *   - awardOneTime: key is fixed per user (e.g. "profile.avatar.first")
 *   - awardDaily:   key includes today's UTC date ("follow.2026-05-13")
 *   - awardStreak:  one-time per milestone day (handled via trackLoginStreak)
 * ---------------------------------------------------------------------------
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type AwardKind =
  | "profile.avatar.first"
  | "profile.bio.first"
  | "follow.daily"
  | "message.daily"
  | "share.profile.daily";

/** YYYY-MM-DD in UTC — stable across server TZs. */
export function utcDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Insert a TSR adjustment row. Returns true if awarded (new row), false if
 * the key already existed for this user (idempotent no-op). Postgres unique
 * violation code is 23505.
 */
async function insertAward(
  sb: SupabaseClient,
  address: string,
  reasonKey: string,
  points: number,
  reason: string,
): Promise<boolean> {
  const { error } = await sb.from("tsr_adjustments").insert({
    flow_address: address,
    points,
    reason,
    reason_key: reasonKey,
    created_by: "gamification",
  });
  if (!error) return true;
  if ((error as { code?: string }).code === "23505") return false;
  // Don't throw — gamification should never break user-facing actions.
  console.error("[gamification] insert failed:", error);
  return false;
}

export async function awardOneTime(
  sb: SupabaseClient,
  address: string,
  key: "profile.avatar.first" | "profile.bio.first",
  points: number,
  reason: string,
): Promise<boolean> {
  return insertAward(sb, address, key, points, reason);
}

export async function awardDaily(
  sb: SupabaseClient,
  address: string,
  kind: "follow.daily" | "message.daily" | "share.profile.daily",
  points: number,
  reason: string,
): Promise<boolean> {
  const key = `${kind}.${utcDate()}`;
  return insertAward(sb, address, key, points, reason);
}

// --------------------------------------------------------------------------
// Login streaks
// --------------------------------------------------------------------------

/** Milestones: each rewarded once per user lifetime. */
const STREAK_MILESTONES: ReadonlyArray<[day: number, points: number]> = [
  [1, 10],
  [5, 20],
  [10, 40],
  [20, 80],
  [40, 160],
  [80, 320],
  [160, 1000],
];

interface StreakRow {
  flow_address: string;
  current_streak: number;
  longest_streak: number;
  last_seen_date: string; // YYYY-MM-DD
}

export interface StreakResult {
  /** Current consecutive-day streak after this heartbeat. */
  streak: number;
  /** Longest streak the user has ever reached. */
  longestStreak: number;
  /** Milestones awarded during this call (can be empty). */
  awardedMilestones: Array<{ day: number; points: number }>;
}

/**
 * Called once per user per page-load. Increments streak if the user was here
 * yesterday, resets to 1 if they missed a day, no-ops if they've already
 * been seen today. Awards any milestone the new streak has unlocked (at
 * most once per user via reason_key='streak.day.<N>').
 */
export async function trackLoginStreak(
  sb: SupabaseClient,
  address: string,
): Promise<StreakResult> {
  const today = utcDate();
  const { data } = await sb
    .from("login_streaks")
    .select("flow_address, current_streak, longest_streak, last_seen_date")
    .eq("flow_address", address)
    .maybeSingle();

  const row = data as StreakRow | null;

  let newStreak = 1;
  if (row) {
    if (row.last_seen_date === today) {
      // Already counted today — return existing state, no awards.
      return {
        streak: row.current_streak,
        longestStreak: row.longest_streak,
        awardedMilestones: [],
      };
    }
    // Compute day diff in UTC using YYYY-MM-DD strings.
    const lastMs = Date.parse(row.last_seen_date + "T00:00:00Z");
    const todayMs = Date.parse(today + "T00:00:00Z");
    const diffDays = Math.round((todayMs - lastMs) / 86400000);
    newStreak = diffDays === 1 ? row.current_streak + 1 : 1;
  }

  const longest = Math.max(row?.longest_streak ?? 0, newStreak);

  await sb.from("login_streaks").upsert(
    {
      flow_address: address,
      current_streak: newStreak,
      longest_streak: longest,
      last_seen_date: today,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "flow_address" },
  );

  // Award any milestone at or below the new streak that hasn't been granted
  // yet. Unique reason_key ensures a user only gets each milestone once ever.
  const awarded: Array<{ day: number; points: number }> = [];
  for (const [day, points] of STREAK_MILESTONES) {
    if (newStreak < day) break;
    const ok = await insertAward(
      sb,
      address,
      `streak.day.${day}`,
      points,
      `Login streak milestone: day ${day}`,
    );
    if (ok) awarded.push({ day, points });
  }

  return { streak: newStreak, longestStreak: longest, awardedMilestones: awarded };
}
