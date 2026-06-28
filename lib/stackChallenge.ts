/**
 * lib/stackChallenge.ts
 * ---------------------------------------------------------------------------
 * Domain helpers for "Test Your Stack" challenges.
 *  - validateChallengeInput: server-side validation for admin upserts.
 *  - mapChallengeRow: snake_case DB row → camelCase TS shape.
 *  - getLeaderboard: live leaderboard from owned_moments (locked only).
 *  - getStackCount: a single user's locked count of a moment.
 *  - settleChallenge: locks in the winner and (optionally) auto-creates
 *    a reward_claims row pointing at the linked prize_rule_id.
 * ---------------------------------------------------------------------------
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StackChallenge {
  id: string;
  title: string;
  subtitle: string | null;
  setId: number;
  playId: number;
  playerName: string | null;
  setName: string | null;
  series: number | null;
  tier: string | null;
  thumbnailUrl: string | null;
  momentName: string | null;
  momentUrl: string | null;
  startsAt: string;
  endsAt: string;
  prizeRuleId: string | null;
  prizeTitle: string;
  prizeDescription: string | null;
  prizeImageUrl: string | null;
  accentColor: string | null;
  enabled: boolean;
  winnerAddress: string | null;
  winnerCount: number | null;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StackChallengeInput {
  id: string;
  title: string;
  subtitle?: string | null;
  setId: number;
  playId: number;
  playerName?: string | null;
  setName?: string | null;
  series?: number | null;
  tier?: string | null;
  thumbnailUrl?: string | null;
  momentName?: string | null;
  momentUrl?: string | null;
  startsAt: string;
  endsAt: string;
  prizeRuleId?: string | null;
  prizeTitle: string;
  prizeDescription?: string | null;
  prizeImageUrl?: string | null;
  accentColor?: string | null;
  enabled?: boolean;
}

export interface LeaderboardRow {
  address: string;
  count: number;
  username: string | null;
  rank: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InvalidChallengeError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "InvalidChallengeError";
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9][a-z0-9-_]{1,63}$/;

export function validateChallengeInput(raw: unknown): StackChallengeInput {
  if (!raw || typeof raw !== "object") {
    throw new InvalidChallengeError("Body must be an object");
  }
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === "string" ? r.id.trim().toLowerCase() : "";
  if (!SLUG_RE.test(id)) {
    throw new InvalidChallengeError("id must be a slug (a-z, 0-9, -_, 2–64 chars)");
  }
  const title = typeof r.title === "string" ? r.title.trim() : "";
  if (!title) throw new InvalidChallengeError("title is required");

  const setId = Number(r.setId);
  const playId = Number(r.playId);
  if (!Number.isInteger(setId) || setId <= 0) {
    throw new InvalidChallengeError("setId must be a positive integer");
  }
  if (!Number.isInteger(playId) || playId <= 0) {
    throw new InvalidChallengeError("playId must be a positive integer");
  }

  const startsAt = typeof r.startsAt === "string" ? r.startsAt : "";
  const endsAt = typeof r.endsAt === "string" ? r.endsAt : "";
  if (!startsAt || !endsAt) {
    throw new InvalidChallengeError("startsAt and endsAt are required ISO timestamps");
  }
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new InvalidChallengeError("endsAt must be after startsAt");
  }

  const prizeTitle = typeof r.prizeTitle === "string" ? r.prizeTitle.trim() : "";
  if (!prizeTitle) throw new InvalidChallengeError("prizeTitle is required");

  const accent = typeof r.accentColor === "string" ? r.accentColor.trim() : "";
  if (accent && !/^#[0-9a-fA-F]{6}$/.test(accent)) {
    throw new InvalidChallengeError("accentColor must be a #RRGGBB hex string");
  }

  return {
    id,
    title,
    subtitle: typeof r.subtitle === "string" ? r.subtitle.trim() || null : null,
    setId,
    playId,
    playerName:   typeof r.playerName   === "string" ? r.playerName.trim()   || null : null,
    setName:      typeof r.setName      === "string" ? r.setName.trim()      || null : null,
    series:       Number.isFinite(Number(r.series)) ? Number(r.series) : null,
    tier:         typeof r.tier         === "string" ? r.tier.trim()         || null : null,
    thumbnailUrl: typeof r.thumbnailUrl === "string" ? r.thumbnailUrl.trim() || null : null,
    momentName:   typeof r.momentName   === "string" ? r.momentName.trim()   || null : null,
    momentUrl:    typeof r.momentUrl    === "string" ? r.momentUrl.trim()    || null : null,
    startsAt,
    endsAt,
    prizeRuleId:   typeof r.prizeRuleId   === "string" ? r.prizeRuleId.trim()   || null : null,
    prizeTitle,
    prizeDescription: typeof r.prizeDescription === "string" ? r.prizeDescription.trim() || null : null,
    prizeImageUrl: typeof r.prizeImageUrl === "string" ? r.prizeImageUrl.trim() || null : null,
    accentColor: accent || null,
    enabled: typeof r.enabled === "boolean" ? r.enabled : true,
  };
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

export function mapChallengeRow(row: Record<string, unknown>): StackChallenge {
  return {
    id:               row.id               as string,
    title:            row.title            as string,
    subtitle:         (row.subtitle         as string | null) ?? null,
    setId:            Number(row.set_id),
    playId:           Number(row.play_id),
    playerName:       (row.player_name      as string | null) ?? null,
    setName:          (row.set_name         as string | null) ?? null,
    series:           row.series == null ? null : Number(row.series),
    tier:             (row.tier             as string | null) ?? null,
    thumbnailUrl:     (row.thumbnail_url    as string | null) ?? null,
    momentName:       (row.moment_name      as string | null) ?? null,
    momentUrl:        (row.moment_url       as string | null) ?? null,
    startsAt:         row.starts_at         as string,
    endsAt:           row.ends_at           as string,
    prizeRuleId:      (row.prize_rule_id    as string | null) ?? null,
    prizeTitle:       row.prize_title       as string,
    prizeDescription: (row.prize_description as string | null) ?? null,
    prizeImageUrl:    (row.prize_image_url  as string | null) ?? null,
    accentColor:      (row.accent_color     as string | null) ?? null,
    enabled:          Boolean(row.enabled),
    winnerAddress:    (row.winner_address   as string | null) ?? null,
    winnerCount:      row.winner_count == null ? null : Number(row.winner_count),
    settledAt:        (row.settled_at       as string | null) ?? null,
    createdAt:        row.created_at        as string,
    updatedAt:        row.updated_at        as string,
  };
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

/**
 * Returns the top `limit` users by locked count of (setId, playId).
 * Pulls all matching rows in one query (selective indexes), groups
 * client-side. owned_moments has indexes on flow_address and set_id,
 * and we filter on is_locked = true so the candidate set stays small.
 */
export async function getLeaderboard(
  sb: SupabaseClient,
  setId: number,
  playId: number,
  limit = 100,
): Promise<LeaderboardRow[]> {
  const PAGE = 1000;
  const counts = new Map<string, number>();

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("owned_moments")
      .select("flow_address")
      .eq("set_id", setId)
      .eq("play_id", playId)
      .eq("is_locked", true)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`leaderboard read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data as Array<{ flow_address: string }>) {
      counts.set(row.flow_address, (counts.get(row.flow_address) ?? 0) + 1);
    }
    if (data.length < PAGE) break;
  }

  // Sort desc, slice, decorate with usernames in one extra query.
  const ranked = [...counts.entries()]
    .map(([address, count]) => ({ address, count }))
    .sort((a, b) => b.count - a.count || a.address.localeCompare(b.address))
    .slice(0, limit);

  if (ranked.length === 0) return [];

  const { data: userRows } = await sb
    .from("users")
    .select("flow_address, topshot_username")
    .in("flow_address", ranked.map((r) => r.address));

  const userMap = new Map<string, string | null>(
    ((userRows ?? []) as Array<{ flow_address: string; topshot_username: string | null }>)
      .map((u) => [u.flow_address, u.topshot_username]),
  );

  return ranked.map((r, i) => ({
    address:  r.address,
    count:    r.count,
    username: userMap.get(r.address) ?? null,
    rank:     i + 1,
  }));
}

/** A single user's current locked stack count. */
export async function getStackCount(
  sb: SupabaseClient,
  address: string,
  setId: number,
  playId: number,
): Promise<number> {
  const { count, error } = await sb
    .from("owned_moments")
    .select("*", { count: "exact", head: true })
    .eq("flow_address", address)
    .eq("set_id", setId)
    .eq("play_id", playId)
    .eq("is_locked", true);
  if (error) return 0;
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Settle
// ---------------------------------------------------------------------------

export interface SettleResult {
  challengeId: string;
  winnerAddress: string | null;
  winnerCount: number;
  prizeClaimCreated: boolean;
  reason?: string;
}

/**
 * Determine the winner of a challenge and persist them. If a prize_rule_id
 * is linked, also create a reward_claims row so the prize lands in the
 * normal admin claims pipeline.
 *
 * Idempotent: if settled_at is already set, returns the existing snapshot.
 */
export async function settleChallenge(
  sb: SupabaseClient,
  challengeId: string,
): Promise<SettleResult> {
  const { data: row, error } = await sb
    .from("stack_challenges")
    .select("*")
    .eq("id", challengeId)
    .maybeSingle();
  if (error || !row) {
    throw new Error(`Challenge not found: ${challengeId}`);
  }
  const ch = mapChallengeRow(row as Record<string, unknown>);

  // Already settled → no-op.
  if (ch.settledAt) {
    return {
      challengeId: ch.id,
      winnerAddress: ch.winnerAddress,
      winnerCount: ch.winnerCount ?? 0,
      prizeClaimCreated: false,
      reason: "already settled",
    };
  }

  const top = await getLeaderboard(sb, ch.setId, ch.playId, 1);
  const winner = top[0] ?? null;

  // Persist winner snapshot (do this even if no entrants — settled_at marks it closed).
  await sb
    .from("stack_challenges")
    .update({
      winner_address: winner?.address ?? null,
      winner_count:   winner?.count ?? null,
      settled_at:     new Date().toISOString(),
    })
    .eq("id", ch.id);

  // Auto-create reward_claims row for the linked prize.
  let prizeClaimCreated = false;
  let reason: string | undefined;
  if (winner && ch.prizeRuleId) {
    const { data: u } = await sb
      .from("users")
      .select("topshot_username")
      .eq("flow_address", winner.address)
      .maybeSingle();
    const tsUser = (u as { topshot_username: string | null } | null)?.topshot_username ?? null;
    if (!tsUser) {
      reason = "winner has no Top Shot username; prize not auto-claimed";
    } else {
      const { data: rule } = await sb
        .from("reward_rules")
        .select("id, reward, is_physical")
        .eq("id", ch.prizeRuleId)
        .maybeSingle();
      const rewardLabel = (rule as { reward?: string } | null)?.reward ?? ch.prizeTitle;
      const isPhysical = (rule as { is_physical?: boolean } | null)?.is_physical ?? false;

      const { error: insertErr } = await sb.from("reward_claims").upsert(
        {
          flow_address: winner.address,
          rule_id: ch.prizeRuleId,
          topshot_username: tsUser,
          reward_label: rewardLabel,
          reward_set_id: ch.setId,
          reward_play_id: ch.playId,
          status: "pending",
          shipping_status: isPhysical ? "queued" : "not_required",
          admin_note: `Auto-credited from stack challenge "${ch.title}" (#${ch.id})`,
        },
        { onConflict: "flow_address,rule_id" },
      );
      if (insertErr) {
        reason = `claim insert failed: ${insertErr.message}`;
      } else {
        prizeClaimCreated = true;
      }
    }
  } else if (winner && !ch.prizeRuleId) {
    reason = "no prize_rule_id linked; manual fulfillment";
  } else if (!winner) {
    reason = "no entrants";
  }

  return {
    challengeId: ch.id,
    winnerAddress: winner?.address ?? null,
    winnerCount: winner?.count ?? 0,
    prizeClaimCreated,
    reason,
  };
}
