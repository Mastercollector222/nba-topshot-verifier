/**
 * POST /api/admin/snapshot-ranks
 * ---------------------------------------------------------------------------
 * Computes current TSR rank + TSR total + challenges_completed for every user
 * and upserts one row per user into `rank_history` for today's UTC date.
 *
 * Intended to be called by a daily cron job, e.g.:
 *   - Vercel Cron (vercel.json):
 *       { "crons": [{ "path": "/api/admin/snapshot-ranks", "schedule": "0 0 * * *" }] }
 *       Note: Vercel Cron hits GET by default — wrap in a GET handler or use
 *       a GitHub Actions workflow that POSTs with an admin session cookie.
 *   - GitHub Actions (schedule: cron: '5 0 * * *'):
 *       curl -X POST https://your-domain/api/admin/snapshot-ranks \
 *            -H "Cookie: sb-access=<admin-jwt>"
 *
 * Upsert semantics: running multiple times on the same UTC day overwrites the
 * earlier row so the final snapshot of the day is always authoritative.
 *
 * Admin-only — gated by requireAdmin().
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { getAllTsrBalances } from "@/lib/tsr";

export async function POST() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const sb = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" UTC

  // ── 1. TSR balances for every address that has any activity ──────────────
  let balances: Awaited<ReturnType<typeof getAllTsrBalances>>;
  try {
    balances = await getAllTsrBalances(sb);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "getAllTsrBalances failed" },
      { status: 500 },
    );
  }

  // Sort descending to compute ranks in one pass.
  balances.sort((a, b) => b.total - a.total);

  // Assign rank — ties share the lowest rank in the group (dense would be
  // fine too, but this matches the live profile page behaviour).
  type Ranked = { address: string; total: number; rank: number | null };
  const ranked: Ranked[] = balances.map((b, idx) => ({
    address: b.address,
    total: b.total,
    rank: b.total > 0 ? idx + 1 : null,
  }));

  // ── 2. Challenges completed per address ───────────────────────────────────
  // Pull all lifetime_completions rows and aggregate in JS — avoids a
  // Postgres GROUP BY that may timeout on very large tables.
  const completionsByAddr = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("lifetime_completions")
      .select("flow_address")
      .range(from, from + 999);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    for (const row of data as { flow_address: string }[]) {
      completionsByAddr.set(
        row.flow_address,
        (completionsByAddr.get(row.flow_address) ?? 0) + 1,
      );
    }
    if (data.length < 1000) break;
  }

  // ── 3. Build upsert rows ──────────────────────────────────────────────────
  const rows = ranked.map((r) => ({
    flow_address: r.address,
    day: today,
    tsr_total: r.total,
    tsr_rank: r.rank,
    challenges_completed: completionsByAddr.get(r.address) ?? 0,
  }));

  if (rows.length === 0) {
    return NextResponse.json({ snapshotted: 0, day: today });
  }

  // Upsert in batches of 500 to stay well within Supabase's payload limit.
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await sb
      .from("rank_history")
      .upsert(rows.slice(i, i + BATCH), { onConflict: "flow_address,day" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ snapshotted: rows.length, day: today });
}
