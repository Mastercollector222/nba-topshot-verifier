/**
 * GET /api/rules
 * ---------------------------------------------------------------------------
 * Public list of enabled reward rules in the full RewardRule shape.
 * Used by the dashboard to render the challenge list BEFORE a user scans,
 * so people can browse challenges + prize Moments without signing in or
 * waiting for a verify job.
 *
 * Cached at the edge for 60 seconds — rule edits propagate quickly but we
 * don't hit the DB on every pageview.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { RewardRule } from "@/lib/verify";

export const revalidate = 60;

interface RuleRow {
  id: string;
  type: string;
  reward: string;
  payload: RewardRule;
  enabled: boolean;
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("reward_rules")
    .select("id, type, reward, payload, enabled")
    .eq("enabled", true)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The `payload` column already holds the full RewardRule JSON.
  const rules: RewardRule[] = ((data ?? []) as RuleRow[]).map((r) => r.payload);

  return NextResponse.json(
    { rules },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
