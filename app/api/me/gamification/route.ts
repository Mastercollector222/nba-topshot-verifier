/**
 * GET /api/me/gamification
 * ---------------------------------------------------------------------------
 * Returns the signed-in user's gamification snapshot:
 *   - streak: { current, longest, lastSeenDate }
 *   - awards: all rows from tsr_adjustments with a reason_key for this user
 *             (i.e. only the gamification ledger, not manual admin grants)
 *   - totalEarned: sum of all gamification-awarded points
 *
 * Public-shape so the /rewards page can render a clean dashboard.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { utcDate } from "@/lib/gamification";
import { getUserTsr } from "@/lib/tsr";

interface AwardRow {
  reason_key: string;
  reason: string | null;
  points: number;
  created_at: string;
}

export async function GET() {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const sb = supabaseAdmin();

  const [streakRes, awardsRes, tsr] = await Promise.all([
    sb
      .from("login_streaks")
      .select("current_streak, longest_streak, last_seen_date")
      .eq("flow_address", address)
      .maybeSingle(),
    sb
      .from("tsr_adjustments")
      .select("reason_key, reason, points, created_at")
      .eq("flow_address", address)
      .not("reason_key", "is", null)
      .order("created_at", { ascending: false }),
    getUserTsr(address, sb),
  ]);

  const streakRow = streakRes.data as {
    current_streak: number;
    longest_streak: number;
    last_seen_date: string;
  } | null;

  const awards = (awardsRes.data as AwardRow[] | null) ?? [];

  const today = utcDate();
  const totalEarned = awards.reduce((s, r) => s + (r.points ?? 0), 0);

  return NextResponse.json({
    today,
    streak: {
      current: streakRow?.current_streak ?? 0,
      longest: streakRow?.longest_streak ?? 0,
      lastSeenDate: streakRow?.last_seen_date ?? null,
    },
    awards,
    totalEarned,
    tsrTotal: tsr.total,
  });
}
