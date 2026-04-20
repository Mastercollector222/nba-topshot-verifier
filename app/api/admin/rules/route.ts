/**
 * /api/admin/rules
 * ---------------------------------------------------------------------------
 *   GET     → list every rule (enabled + disabled) — admin only.
 *   POST    → upsert a rule by id. Body is a full RewardRule object, or
 *             `{ rule: RewardRule, enabled?: boolean }`. Server re-validates.
 *   DELETE  → `?id=<ruleId>` removes a rule.
 *
 * All endpoints require the caller's JWT to resolve to a Flow address
 * listed in `ADMIN_FLOW_ADDRESSES`.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import {
  validateSingleRule,
  InvalidRuleError,
  type RewardRule,
} from "@/lib/verify";

interface RuleRow {
  id: string;
  type: string;
  reward: string;
  payload: RewardRule;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("reward_rules")
    .select("id, type, reward, payload, enabled, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rules: (data ?? []) as RuleRow[] });
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Accept either a raw rule or `{ rule, enabled }`.
  const input = body as { rule?: unknown; enabled?: unknown };
  const ruleRaw =
    input && typeof input === "object" && "rule" in input ? input.rule : body;
  const enabled =
    input && typeof input === "object" && typeof input.enabled === "boolean"
      ? input.enabled
      : true;

  let rule: RewardRule;
  try {
    rule = validateSingleRule(ruleRaw);
  } catch (e) {
    const msg =
      e instanceof InvalidRuleError ? e.message : "Invalid rule payload";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const row = {
    id: rule.id,
    type: rule.type,
    reward: rule.reward,
    payload: rule,
    enabled,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("reward_rules")
    .upsert(row, { onConflict: "id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, rule: row });
}

export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "Missing `id` query param" },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();
  const { error } = await admin.from("reward_rules").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
