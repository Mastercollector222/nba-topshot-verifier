/**
 * POST /api/me/heartbeat
 * ---------------------------------------------------------------------------
 * Updates the signed-in user's login streak, awards streak milestones, and
 * rolls the once-per-UTC-day "daily chest" with a random TSR bonus.
 * Idempotent — duplicate calls on the same UTC day are no-ops.
 *
 * Returns:
 *   {
 *     streak,
 *     longestStreak,
 *     awardedMilestones: [{day, points}],
 *     chest: { rarity, points, basePoints, multiplier, date } | null
 *   }
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { rollDailyChest, trackLoginStreak } from "@/lib/gamification";

export async function POST() {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  // Order matters: streak first so the chest multiplier sees the just-
  // incremented current_streak (not yesterday's value).
  const streak = await trackLoginStreak(sb, address);
  const chest = await rollDailyChest(sb, address);
  return NextResponse.json({ ...streak, chest });
}
