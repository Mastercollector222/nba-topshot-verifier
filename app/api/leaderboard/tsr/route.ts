/**
 * GET /api/leaderboard/tsr
 * ---------------------------------------------------------------------------
 * Public TSR (Top Shot Rewards) points ranking. Aggregates two ledgers:
 *   - `lifetime_completions.tsr_points` (snapshotted at earn time)
 *   - `tsr_adjustments.points` (manual admin grants/revokes)
 *
 * Joins `reward_claims.topshot_username` so the public board renders
 * Top Shot usernames instead of bare wallet addresses (matching the
 * Challenges leaderboard). No Moment data leaves the server.
 *
 * Response:
 *   {
 *     entries: Array<{
 *       address: string,
 *       username: string | null,
 *       total: number,
 *       fromChallenges: number,
 *       fromAdjustments: number,
 *     }>,
 *     generatedAt: string,
 *   }
 *
 * Cached at the edge for 30s (matches the Challenges leaderboard).
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";
import { getAllTsrBalances } from "@/lib/tsr";
import { buildUsernameMap } from "@/lib/usernames";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("pageSize")) || 25),
  );

  const admin = supabaseAdmin();

  let balances;
  try {
    balances = await getAllTsrBalances(admin);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "TSR aggregate failed" },
      { status: 500 },
    );
  }

  // Resolve display usernames: verified `users.topshot_username` wins,
  // unverified `reward_claims.topshot_username` falls back.
  const usernameByAddr = await buildUsernameMap(admin);

  // Rank: highest total first; ties broken alphabetically by address
  // for deterministic ordering.
  const allSorted = balances
    .filter((b) => b.total !== 0) // hide users with no activity
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.address.localeCompare(b.address);
    });
  const total = allSorted.length;
  const ranked = allSorted
    .slice((page - 1) * pageSize, page * pageSize)
    .map((b) => ({
      address: b.address,
      username: usernameByAddr.get(b.address) ?? null,
      avatarUrl: null as string | null,
      total: b.total,
      fromChallenges: b.fromChallenges,
      fromAdjustments: b.fromAdjustments,
    }));

  // Fetch avatar_url for ranked addresses in one query.
  const addrs = ranked.map((e) => e.address);
  if (addrs.length > 0) {
    const { data: avatarRows } = await admin
      .from("users")
      .select("flow_address, avatar_url")
      .in("flow_address", addrs);
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

  return NextResponse.json(
    { entries: ranked, page, pageSize, total, generatedAt: new Date().toISOString() },
    {
      headers: {
        "cache-control":
          "public, max-age=30, stale-while-revalidate=120",
      },
    },
  );
}
