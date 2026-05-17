/**
 * /api/admin/stack-challenges
 * ---------------------------------------------------------------------------
 *   GET   → list every challenge (enabled + disabled).
 *   POST  → upsert by id.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { logAdminAction } from "@/lib/adminAudit";
import {
  validateChallengeInput,
  mapChallengeRow,
  InvalidChallengeError,
} from "@/lib/stackChallenge";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("stack_challenges")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const challenges = (data ?? []).map((r) => mapChallengeRow(r as Record<string, unknown>));
  return NextResponse.json({ challenges });
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let input;
  try {
    input = validateChallengeInput(body);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof InvalidChallengeError ? e.message : "Invalid input" },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();

  const { data: beforeRow } = await sb
    .from("stack_challenges")
    .select("id, enabled, set_id, play_id, ends_at")
    .eq("id", input.id)
    .maybeSingle();

  const row = {
    id:                input.id,
    title:             input.title,
    subtitle:          input.subtitle,
    set_id:            input.setId,
    play_id:           input.playId,
    player_name:       input.playerName,
    set_name:          input.setName,
    series:            input.series,
    tier:              input.tier,
    thumbnail_url:     input.thumbnailUrl,
    starts_at:         input.startsAt,
    ends_at:           input.endsAt,
    prize_rule_id:     input.prizeRuleId,
    prize_title:       input.prizeTitle,
    prize_description: input.prizeDescription,
    prize_image_url:   input.prizeImageUrl,
    accent_color:      input.accentColor,
    enabled:           input.enabled ?? true,
    updated_at:        new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("stack_challenges")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void logAdminAction({
    actor: gate.address,
    action: beforeRow ? "stack_challenge.update" : "stack_challenge.create",
    targetType: "stack_challenge",
    targetId: input.id,
    before: beforeRow as Record<string, unknown> | null,
    after: row as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, challenge: mapChallengeRow(data as Record<string, unknown>) });
}
