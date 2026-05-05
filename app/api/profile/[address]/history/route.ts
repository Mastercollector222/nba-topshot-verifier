/**
 * GET /api/profile/[address]/history?days=30
 * ---------------------------------------------------------------------------
 * Returns the last N days of rank_history rows for a Flow address.
 *
 * Response: { points: [{ day, tsrTotal, tsrRank, challengesCompleted }] }
 *   - `points` is sorted ascending by day (oldest first) for chart rendering.
 *   - `days` defaults to 30; capped at 365.
 *   - Public — no auth required (data is already publicly visible on the
 *     leaderboard and profile pages).
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function normalizeAddress(v: string): string | null {
  const t = v.trim().toLowerCase();
  return /^0x[0-9a-f]{16}$/.test(t) ? t : null;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ address: string }> },
) {
  const { address: raw } = await context.params;
  const address = normalizeAddress(raw);
  if (!address) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const url = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? "30") || 30));

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("rank_history")
    .select("day, tsr_total, tsr_rank, challenges_completed")
    .eq("flow_address", address)
    .order("day", { ascending: true })
    .limit(days);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const points = (data ?? []).map((r) => ({
    day: r.day as string,
    tsrTotal: r.tsr_total as number,
    tsrRank: (r.tsr_rank ?? null) as number | null,
    challengesCompleted: r.challenges_completed as number,
  }));

  return NextResponse.json({ points });
}
