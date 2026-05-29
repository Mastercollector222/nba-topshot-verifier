/**
 * /api/cron/settle-battles
 * ---------------------------------------------------------------------------
 * Vercel cron — runs every 15 minutes. Settles active battles whose 24h
 * window has expired, expires stale pending invitations, and awards TSR.
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { settleExpiredBattles } from "@/lib/battles";

export async function GET(req: NextRequest) {
  // Verify cron secret in production
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await settleExpiredBattles(supabaseAdmin());
    return NextResponse.json({
      settled: results.length,
      results,
    });
  } catch (e) {
    console.error("[settle-battles] error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
