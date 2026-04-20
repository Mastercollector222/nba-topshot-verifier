/**
 * POST /api/admin/seed
 * Re-imports every rule from `config/rewards.json` into the `reward_rules`
 * table as `enabled = true`. Existing rows with the same id are overwritten.
 * Admin only.
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { parseRewardsConfig } from "@/lib/verify";
import rewardsJson from "@/config/rewards.json";

export async function POST() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let rules;
  try {
    rules = parseRewardsConfig(rewardsJson).rules;
  } catch (e) {
    return NextResponse.json(
      {
        error: `Invalid config/rewards.json: ${
          e instanceof Error ? e.message : String(e)
        }`,
      },
      { status: 500 },
    );
  }

  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  const rows = rules.map((r) => ({
    id: r.id,
    type: r.type,
    reward: r.reward,
    payload: r,
    enabled: true,
    updated_at: now,
  }));

  const { error } = await admin
    .from("reward_rules")
    .upsert(rows, { onConflict: "id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, seeded: rows.length });
}
