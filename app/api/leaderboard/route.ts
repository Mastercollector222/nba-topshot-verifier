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
 *     totalRules: number,       // union of enabled rules + historically-completed rule ids
 *     generatedAt: string,
 *   }
 *
 * Performance: aggregation runs in Postgres via the
 * `leaderboard_completions` and `leaderboard_total_rules` views (defined
 * in supabase/schema.sql), so this route does NOT page thousands of
 * `lifetime_completions` rows into Node memory on every cache miss.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";

interface AggRow {
  flow_address: string;
  completed: number;
  last_earned_at: string;
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
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("pageSize")) || 25),
  );

  const admin = supabaseAdmin();

  // Fan-out the three independent reads:
  //  1. The page slice from `leaderboard_completions` (Postgres-aggregated).
  //  2. The grand total of ranked addresses (for pagination metadata).
  //  3. The `totalRules` denominator from `leaderboard_total_rules`.
  // Sort in SQL: completions desc, then earliest last_earned_at first
  // (matches the previous in-process tiebreaker).
  const fromIdx = (page - 1) * pageSize;
  const toIdx = fromIdx + pageSize - 1;

  const [pageRes, totalRes, totalRulesRes] = await Promise.all([
    admin
      .from("leaderboard_completions")
      .select("flow_address, completed, last_earned_at")
      .order("completed", { ascending: false })
      .order("last_earned_at", { ascending: true })
      .range(fromIdx, toIdx),
    admin
      .from("leaderboard_completions")
      .select("flow_address", { count: "exact", head: true }),
    admin.from("leaderboard_total_rules").select("total").maybeSingle(),
  ]);

  if (pageRes.error) {
    return NextResponse.json({ error: pageRes.error.message }, { status: 500 });
  }

  const ranked: Entry[] = ((pageRes.data ?? []) as AggRow[]).map((r) => ({
    address: r.flow_address,
    username: null,
    avatarUrl: null,
    completed: r.completed,
    lastEarnedAt: r.last_earned_at,
  }));
  const total = totalRes.count ?? ranked.length;
  const totalRules =
    (totalRulesRes.data as { total: number } | null)?.total ?? 0;

  // Resolve display usernames + avatars only for the addresses on this
  // page (used to be every user — needlessly expensive). Verified
  // `users.topshot_username` (linked via Top Shot's GraphQL) wins; we fall
  // back to the most recent unverified `reward_claims.topshot_username`
  // for users who claimed pre-link.
  const rankedAddrs = ranked.map((e) => e.address);
  if (rankedAddrs.length > 0) {
    const [usersRes, claimsRes] = await Promise.all([
      admin
        .from("users")
        .select("flow_address, topshot_username, avatar_url")
        .in("flow_address", rankedAddrs),
      admin
        .from("reward_claims")
        .select("flow_address, topshot_username, updated_at")
        .in("flow_address", rankedAddrs)
        .not("topshot_username", "is", null)
        .order("updated_at", { ascending: false }),
    ]);

    const userMap = new Map(
      ((usersRes.data ?? []) as Array<{
        flow_address: string;
        topshot_username: string | null;
        avatar_url: string | null;
      }>).map((r) => [r.flow_address, r]),
    );
    const claimMap = new Map<string, string>();
    for (const c of (claimsRes.data ?? []) as Array<{
      flow_address: string;
      topshot_username: string | null;
    }>) {
      if (c.topshot_username && !claimMap.has(c.flow_address)) {
        claimMap.set(c.flow_address, c.topshot_username);
      }
    }

    for (const entry of ranked) {
      const u = userMap.get(entry.address);
      entry.username = u?.topshot_username ?? claimMap.get(entry.address) ?? null;
      entry.avatarUrl = u?.avatar_url ?? null;
    }
  }

  return NextResponse.json(
    {
      entries: ranked,
      page,
      pageSize,
      total,
      totalRules,
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
