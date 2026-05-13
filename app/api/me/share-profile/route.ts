/**
 * POST /api/me/share-profile
 * ---------------------------------------------------------------------------
 * Called client-side when the signed-in user taps "Share" on their own
 * profile page and the X/Twitter intent window opens. Grants +10 TSR daily
 * (once per user per UTC day via tsr_adjustments.reason_key).
 *
 * Body: none.
 * Returns: { awarded: number } — 10 on first call today, 0 thereafter.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { awardDaily } from "@/lib/gamification";

export async function POST() {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const ok = await awardDaily(
    sb,
    address,
    "share.profile.daily",
    10,
    "Gamification: shared profile on X today",
  );

  return NextResponse.json({ awarded: ok ? 10 : 0 });
}
