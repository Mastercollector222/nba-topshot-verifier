/**
 * GET /api/stack-challenges/[id]/leaderboard?limit=50
 * ---------------------------------------------------------------------------
 * Live leaderboard for a stack challenge. If a session exists, also returns
 * { you: { rank, count } } so the public page can show the viewer's standing.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionAddress } from "@/lib/admin";
import {
  mapChallengeRow,
  getLeaderboard,
  getStackCount,
} from "@/lib/stackChallenge";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(5, parseInt(url.searchParams.get("limit") ?? "50", 10)));

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from("stack_challenges")
    .select("*")
    .eq("id", id)
    .eq("enabled", true)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ch = mapChallengeRow(row as Record<string, unknown>);
  const leaderboard = await getLeaderboard(sb, ch.setId, ch.playId, limit);

  // Viewer's own count (if signed in).
  const viewer = await getSessionAddress();
  let you: { rank: number | null; count: number } | null = null;
  if (viewer) {
    const count = await getStackCount(sb, viewer, ch.setId, ch.playId);
    const inTop = leaderboard.find((r) => r.address === viewer);
    you = { rank: inTop?.rank ?? null, count };
  }

  return NextResponse.json({ challenge: ch, leaderboard, you });
}
