/**
 * POST /api/me/heartbeat
 * ---------------------------------------------------------------------------
 * Updates the signed-in user's login streak and awards any milestone points
 * the streak has unlocked. Intended to be called exactly once per page load
 * (e.g. from the dashboard on mount). Safe to call more often — duplicate
 * calls on the same UTC day are no-ops.
 *
 * Returns: { streak, longestStreak, awardedMilestones: [{day, points}] }
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { trackLoginStreak } from "@/lib/gamification";

export async function POST() {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const result = await trackLoginStreak(sb, address);
  return NextResponse.json(result);
}
