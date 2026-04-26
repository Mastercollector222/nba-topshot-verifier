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
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit")) || 25),
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
  const entries = balances
    .filter((b) => b.total !== 0) // hide users with no activity
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.address.localeCompare(b.address);
    })
    .slice(0, limit)
    .map((b) => ({
      address: b.address,
      username: usernameByAddr.get(b.address) ?? null,
      total: b.total,
      fromChallenges: b.fromChallenges,
      fromAdjustments: b.fromAdjustments,
    }));

  return NextResponse.json(
    { entries, generatedAt: new Date().toISOString() },
    {
      headers: {
        "cache-control":
          "public, max-age=30, stale-while-revalidate=120",
      },
    },
  );
}
