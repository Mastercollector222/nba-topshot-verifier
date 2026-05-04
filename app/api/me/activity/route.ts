/**
 * GET /api/me/activity
 * ---------------------------------------------------------------------------
 * Authenticated. Returns the 10 most-recent activity items for the signed-in
 * user, merged from two sources:
 *
 *   "scan"       — last 5 succeeded verify_jobs rows
 *   "completion" — last 5 lifetime_completions rows (reward label already
 *                  snapshotted on the row — no join required)
 *
 * Response:
 *   { items: Array<{ type: "scan"|"completion", at: string, label: string }> }
 *   Sorted descending by `at`.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, verifyFlowSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  const claims = token ? await verifyFlowSession(token) : null;
  if (!claims?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const address = claims.sub;
  const sb = supabaseAdmin();

  // Fetch both sources in parallel.
  const [scanRes, completionRes] = await Promise.all([
    sb
      .from("verify_jobs")
      .select("created_at")
      .eq("user_address", address)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(5),
    sb
      .from("lifetime_completions")
      .select("first_earned_at, reward")
      .eq("flow_address", address)
      .order("first_earned_at", { ascending: false })
      .limit(5),
  ]);

  type Item = { type: "scan" | "completion"; at: string; label: string };

  const items: Item[] = [
    ...((scanRes.data ?? []) as Array<{ created_at: string }>).map((r) => ({
      type: "scan" as const,
      at: r.created_at,
      label: "Collection scanned",
    })),
    ...((completionRes.data ?? []) as Array<{
      first_earned_at: string;
      reward: string;
    }>).map((r) => ({
      type: "completion" as const,
      at: r.first_earned_at,
      label: `Completed ${r.reward}`,
    })),
  ];

  // Merge and take top 10 by recency.
  items.sort((a, b) => b.at.localeCompare(a.at));
  const top10 = items.slice(0, 10);

  return NextResponse.json({ items: top10 });
}
