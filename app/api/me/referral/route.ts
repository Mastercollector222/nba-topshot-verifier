/**
 * GET /api/me/referral
 * ---------------------------------------------------------------------------
 * Returns the signed-in user's referral snapshot:
 *   - code        : their unique referral code (auto-generated on sign-in)
 *   - referralCount: number of users they've successfully referred
 *   - totalEarned : sum of TSR earned via referrals
 *   - referees    : list of referred users (most recent first)
 *
 * If the user has no code yet (edge case — ensureReferralCode hadn't run),
 * we generate one on the fly so the UI always has something to show.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureReferralCode, getReferralStats } from "@/lib/referrals";

export async function GET() {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  await ensureReferralCode(sb, address);
  const stats = await getReferralStats(sb, address);
  return NextResponse.json(stats);
}
