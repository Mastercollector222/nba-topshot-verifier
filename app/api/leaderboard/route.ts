/**
 * GET /api/leaderboard
 * ---------------------------------------------------------------------------
 * Public, read-only ranking of users by number of LIFETIME completed
 * reward rules. Reads from `lifetime_completions` (append-only) rather
 * than `earned_rewards` (which is rebuilt on every scan and cascades
 * away when admins delete rules), so time-limited / removed challenges
 * don't erase a user's standing.
 *
 * Uses the service-role client so RLS doesn't hide other users' rows
 * from the aggregation. We only return counts + Flow addresses — no
 * Moment data leaves the server.
 *
 * Response shape:
 *   {
 *     entries: Array<{
 *       address: string,        // 0x… Flow address (lowercased)
 *       completed: number,      // count of distinct earned rules
 *       lastEarnedAt: string,   // ISO timestamp of most recent earned row
 *     }>,
 *     totalRules: number,       // number of currently-enabled reward_rules
 *     generatedAt: string,
 *   }
 *
 * Performance note: aggregation is done in-process because Supabase's
 * REST surface doesn't expose `count(*) group by` directly. With the
 * current scale (≤ a few thousand users) this is trivially fast; if the
 * project grows, swap this for a SQL view with `select address, count(*)`.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";
import { buildUsernameMap } from "@/lib/usernames";

interface CompletionRow {
  flow_address: string;
  first_earned_at: string;
}

interface Entry {
  address: string;
  /**
   * NBA Top Shot username the user submitted on a claim form. Becomes the
   * primary display name on the leaderboard when present; the wallet
   * address is shown only as a fallback for users who haven't claimed yet.
   */
  username: string | null;
  avatarUrl: string | null;
  completed: number;
  lastEarnedAt: string;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit")) || 25),
  );

  const admin = supabaseAdmin();

  // Pull every lifetime completion. We read from `lifetime_completions`
  // (append-only) instead of `earned_rewards` so deleted / time-limited
  // rules don't erase past leaderboard standings. Page past Supabase's
  // 1000-row default cap so large user bases don't get truncated.
  const PAGE = 1000;
  const rows: CompletionRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("lifetime_completions")
      .select("flow_address, first_earned_at")
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as CompletionRow[]));
    if (data.length < PAGE) break;
  }

  // Aggregate per-address: count of completed rules + most recent
  // first_earned_at (so the leaderboard can show "last activity").
  const acc = new Map<string, Entry>();
  for (const r of rows) {
    const cur = acc.get(r.flow_address);
    if (cur) {
      cur.completed += 1;
      if (r.first_earned_at > cur.lastEarnedAt) {
        cur.lastEarnedAt = r.first_earned_at;
      }
    } else {
      acc.set(r.flow_address, {
        address: r.flow_address,
        username: null,
        avatarUrl: null,
        completed: 1,
        lastEarnedAt: r.first_earned_at,
      });
    }
  }

  // Resolve display usernames. Verified `users.topshot_username` (linked
  // and verified against Top Shot's GraphQL) wins; falls back to the
  // most recent unverified username from `reward_claims` for users who
  // haven't linked yet but have submitted a claim historically.
  const usernameByAddr = await buildUsernameMap(admin);
  for (const entry of acc.values()) {
    const u = usernameByAddr.get(entry.address);
    if (u) entry.username = u;
  }

  // Fetch avatar_url for the ranked addresses in one batched query.
  const ranked = [...acc.values()]
    .sort((a, b) => {
      if (b.completed !== a.completed) return b.completed - a.completed;
      return a.lastEarnedAt.localeCompare(b.lastEarnedAt);
    })
    .slice(0, limit);
  const rankedAddrs = ranked.map((e) => e.address);
  if (rankedAddrs.length > 0) {
    const { data: avatarRows } = await admin
      .from("users")
      .select("flow_address, avatar_url")
      .in("flow_address", rankedAddrs);
    if (avatarRows) {
      const avatarMap = new Map(
        (avatarRows as { flow_address: string; avatar_url: string | null }[]).map(
          (r) => [r.flow_address, r.avatar_url],
        ),
      );
      for (const entry of ranked) {
        entry.avatarUrl = avatarMap.get(entry.address) ?? null;
      }
    }
  }

  // Total enabled rules — useful for the "X / N" denominator on the UI.
  const { count } = await admin
    .from("reward_rules")
    .select("id", { count: "exact", head: true })
    .eq("enabled", true);

  return NextResponse.json(
    {
      entries: ranked,
      totalRules: count ?? 0,
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        // Light caching at the edge so a busy leaderboard doesn't pound DB.
        "cache-control":
          "public, max-age=30, stale-while-revalidate=120",
      },
    },
  );
}
