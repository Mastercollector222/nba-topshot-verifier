/**
 * /api/battles/leaderboard
 * ---------------------------------------------------------------------------
 * GET → top 100 ELO-rated battle players. Public endpoint (no auth required).
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getEloLeaderboard } from "@/lib/battles";

export async function GET() {
  try {
    const leaderboard = await getEloLeaderboard(supabaseAdmin(), 100);
    return NextResponse.json({ leaderboard });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
