/**
 * GET /api/leaderboard/crafting
 * ---------------------------------------------------------------------------
 * Public crafting ranking. Counts each user's COMPLETED forge crafts
 * (forge_submissions in status burn_verified or reward_sent) and sums the
 * Master Collector Crafting Points awarded by each recipe they crafted.
 *
 * Joins display usernames (verified `users.topshot_username`, falling back to
 * `reward_claims.topshot_username`) and avatar_url, matching the other boards.
 *
 * Response:
 *   {
 *     entries: Array<{ address, username, avatarUrl, crafts, points }>,
 *     page, pageSize, total, generatedAt
 *   }
 *
 * Cached at the edge for 30s (matches the other leaderboards).
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";
import { loadCraftStats } from "@/lib/forge";
import { buildUsernameMap } from "@/lib/usernames";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("pageSize")) || 25),
  );

  const admin = supabaseAdmin();

  let stats;
  try {
    stats = await loadCraftStats(admin);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Crafting aggregate failed" },
      { status: 500 },
    );
  }

  const usernameByAddr = await buildUsernameMap(admin);

  // Rank: most crafts first, then points, then address for determinism.
  const allSorted = stats
    .filter((s) => s.crafts > 0)
    .sort((a, b) => {
      if (b.crafts !== a.crafts) return b.crafts - a.crafts;
      if (b.points !== a.points) return b.points - a.points;
      return a.address.localeCompare(b.address);
    });
  const total = allSorted.length;
  const ranked = allSorted
    .slice((page - 1) * pageSize, page * pageSize)
    .map((s) => ({
      address: s.address,
      username: usernameByAddr.get(s.address) ?? null,
      avatarUrl: null as string | null,
      crafts: s.crafts,
      points: s.points,
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
        "cache-control": "public, max-age=30, stale-while-revalidate=120",
      },
    },
  );
}
