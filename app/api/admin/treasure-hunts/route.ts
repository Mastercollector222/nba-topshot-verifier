/**
 * /api/admin/treasure-hunts
 * ---------------------------------------------------------------------------
 *   GET   → list every hunt (enabled + disabled).
 *   POST  → upsert a hunt by id. Body must satisfy `validateHuntInput`
 *           (see lib/treasureHunt.ts). Server re-validates every nested
 *           rule via the existing `validateSingleRule`.
 *
 * Per-hunt DELETE lives in `[id]/route.ts`. Entry list lives in
 * `[id]/entries/route.ts`.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import {
  validateHuntInput,
  mapHuntRow,
  InvalidHuntError,
} from "@/lib/treasureHunt";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("treasure_hunts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const hunts = (data ?? []).map((row) => mapHuntRow(row));
  return NextResponse.json({ hunts });
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

  let input;
  try {
    input = validateHuntInput(body);
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof InvalidHuntError ? e.message : "Invalid hunt payload",
      },
      { status: 400 },
    );
  }

  // Map our camelCase TS shape to the DB's snake_case columns. We let the
  // DB CHECK constraint catch any (ends_at <= starts_at) leakage.
  const row = {
    id: input.id,
    title: input.title,
    theme: input.theme ?? null,
    description: input.description ?? null,
    prize_title: input.prizeTitle,
    prize_description: input.prizeDescription ?? null,
    prize_image_url: input.prizeImageUrl ?? null,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    gate_rule: input.gateRule,
    task_rules: input.taskRules,
    enabled: input.enabled ?? true,
    updated_at: new Date().toISOString(),
  };

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("treasure_hunts")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, hunt: mapHuntRow(data) });
}
