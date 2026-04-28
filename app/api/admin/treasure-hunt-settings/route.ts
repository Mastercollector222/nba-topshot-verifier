/**
 * /api/admin/treasure-hunt-settings
 * ---------------------------------------------------------------------------
 *   GET  → returns the singleton settings row { globalGate, updatedAt }.
 *   PUT  → upserts the singleton. Body: { globalGate: RewardRule | null }.
 *
 * The "global gate" is a single RewardRule that protects access to the
 * entire /treasure-hunt section. Setting it to null opens the section
 * to all signed-in users.
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

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("treasure_hunt_settings")
    .select("global_gate, updated_at")
    .eq("id", "default")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    globalGate: (data?.global_gate ?? null) as RewardRule | null,
    updatedAt: data?.updated_at ?? null,
  });
}

export async function PUT(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const input = body as { globalGate?: unknown };

  let normalized: RewardRule | null = null;
  if (input.globalGate != null) {
    try {
      normalized = validateSingleRule(input.globalGate);
    } catch (e) {
      return NextResponse.json(
        {
          error:
            e instanceof InvalidRuleError
              ? `globalGate invalid: ${e.message}`
              : "globalGate invalid",
        },
        { status: 400 },
      );
    }
  }

  const sb = supabaseAdmin();
  const { error } = await sb.from("treasure_hunt_settings").upsert(
    {
      id: "default",
      global_gate: normalized,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, globalGate: normalized });
}
