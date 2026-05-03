/**
 * GET /api/me/stats
 * ---------------------------------------------------------------------------
 * Authenticated endpoint. Returns per-user activity stats:
 *
 *   streakDays  — consecutive UTC calendar days (ending today or yesterday)
 *                 where the user had at least one succeeded verify_jobs row.
 *
 *   tsrTotal    — this user's total TSR balance.
 *
 *   tsrPercentile — what % of users with any TSR this user beats (0–100).
 *                   e.g. 73 means the user is above 73 % of active collectors.
 *
 * All computation is server-side; the client just reads the result.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, verifyFlowSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { getAllTsrBalances, getUserTsr } from "@/lib/tsr";

export async function GET() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  const claims = token ? await verifyFlowSession(token) : null;
  if (!claims?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const address = claims.sub;
  const sb = supabaseAdmin();

  // ── Streak ──────────────────────────────────────────────────────────────
  // Read the last 60 days of succeeded verify_jobs for this user.
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 60);

  const { data: jobRows } = await sb
    .from("verify_jobs")
    .select("created_at")
    .eq("user_address", address)
    .eq("status", "succeeded")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false });

  // Collect the distinct UTC calendar days that had a succeeded scan.
  const activeDays = new Set<string>(
    ((jobRows ?? []) as Array<{ created_at: string }>).map(
      (r) => r.created_at.slice(0, 10), // "YYYY-MM-DD"
    ),
  );

  // Walk backwards from today, counting consecutive days.
  let streakDays = 0;
  const todayUTC = new Date().toISOString().slice(0, 10);
  const yesterdayUTC = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  // Streak is valid if today OR yesterday had a scan (handles timezones).
  const startDay = activeDays.has(todayUTC)
    ? todayUTC
    : activeDays.has(yesterdayUTC)
      ? yesterdayUTC
      : null;

  if (startDay) {
    const cursor = new Date(startDay + "T00:00:00Z");
    while (true) {
      const key = cursor.toISOString().slice(0, 10);
      if (!activeDays.has(key)) break;
      streakDays++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
  }

  // ── TSR + percentile ─────────────────────────────────────────────────────
  const [userTsr, allBalances] = await Promise.all([
    getUserTsr(address, sb),
    getAllTsrBalances(sb),
  ]);

  const tsrTotal = userTsr.total;

  // Percentile: among users with TSR > 0, what fraction does this user beat?
  const active = allBalances.filter((b) => b.total > 0);
  let tsrPercentile: number | null = null;
  if (active.length > 0 && tsrTotal > 0) {
    const below = active.filter((b) => b.total < tsrTotal).length;
    tsrPercentile = Math.round((below / active.length) * 100);
  }

  return NextResponse.json({ streakDays, tsrTotal, tsrPercentile });
}
