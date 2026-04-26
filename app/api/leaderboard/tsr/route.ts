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

interface ClaimRow {
  flow_address: string;
  topshot_username: string;
  updated_at: string;
}

const PAGE = 1000;

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

  // Fetch the most recently submitted Top Shot username per address
  // from `reward_claims`, exactly as the Challenges leaderboard does.
  const claimRows: ClaimRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("reward_claims")
      .select("flow_address, topshot_username, updated_at")
      .range(from, from + PAGE - 1);
    if (error) break; // non-fatal; usernames are nice-to-have
    if (!data || data.length === 0) break;
    claimRows.push(...(data as ClaimRow[]));
    if (data.length < PAGE) break;
  }
  const usernameByAddr = new Map<string, { name: string; updatedAt: string }>();
  for (const c of claimRows) {
    if (!c.topshot_username) continue;
    const cur = usernameByAddr.get(c.flow_address);
    if (!cur || c.updated_at > cur.updatedAt) {
      usernameByAddr.set(c.flow_address, {
        name: c.topshot_username,
        updatedAt: c.updated_at,
      });
    }
  }

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
      username: usernameByAddr.get(b.address)?.name ?? null,
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
