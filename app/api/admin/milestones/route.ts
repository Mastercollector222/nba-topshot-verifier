/**
 * /api/admin/milestones
 * ---------------------------------------------------------------------------
 *   GET    → list all milestones (enabled + disabled)
 *   POST   → create a new milestone
 *   PATCH  → update milestone by id (body: { id, ...fields })
 *   DELETE → ?id=<uuid> deletes a milestone
 *
 * All endpoints require admin auth via requireAdmin().
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("tsr_milestones")
    .select("*")
    .order("threshold", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ milestones: data ?? [] });
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  if (!b.threshold || !b.reward_label) {
    return NextResponse.json({ error: "threshold and reward_label are required" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("tsr_milestones")
    .insert({
      threshold: Number(b.threshold),
      reward_label: String(b.reward_label),
      bonus_tsr: Number(b.bonus_tsr ?? 0),
      moment_description: b.moment_description ? String(b.moment_description) : null,
      enabled: b.enabled !== false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ milestone: data });
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { id, ...rest } = b;
  const patch: Record<string, unknown> = {};
  if (rest.threshold !== undefined) patch.threshold = Number(rest.threshold);
  if (rest.reward_label !== undefined) patch.reward_label = String(rest.reward_label);
  if (rest.bonus_tsr !== undefined) patch.bonus_tsr = Number(rest.bonus_tsr);
  if (rest.moment_description !== undefined) patch.moment_description = rest.moment_description ? String(rest.moment_description) : null;
  if (rest.enabled !== undefined) patch.enabled = Boolean(rest.enabled);

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("tsr_milestones")
    .update(patch)
    .eq("id", String(id))
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ milestone: data });
}

export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const sb = supabaseAdmin();
  const { error } = await sb.from("tsr_milestones").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
