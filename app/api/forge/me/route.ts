/**
 * GET /api/forge/me
 * ---------------------------------------------------------------------------
 * The signed-in user's forge summary:
 *   - craftsCompleted: number of completed crafts (burn_verified or reward_sent)
 *   - craftPoints:     total Master Collector Crafting Points earned
 *
 * Returns { signedIn: false } when no session is present.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionAddress } from "@/lib/admin";
import { loadCraftStatsForAddress } from "@/lib/forge";

export async function GET() {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ signedIn: false, craftsCompleted: 0, craftPoints: 0 });
  }

  const sb = supabaseAdmin();
  const stats = await loadCraftStatsForAddress(sb, address);

  return NextResponse.json({
    signedIn: true,
    craftsCompleted: stats.crafts,
    craftPoints: stats.points,
  });
}
