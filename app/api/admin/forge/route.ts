/**
 * /api/admin/forge
 * ---------------------------------------------------------------------------
 *   GET  → list every forge recipe (enabled + disabled), newest first, each
 *          decorated with submission stats.
 *   POST → upsert a recipe by id.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { logAdminAction } from "@/lib/adminAudit";
import {
  validateRecipeInput,
  mapRecipeRow,
  InvalidRecipeError,
} from "@/lib/forge";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("forge_recipes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const recipes = (data ?? []).map((r) => mapRecipeRow(r as Record<string, unknown>));

  // Submission stats per recipe (cheap: small set).
  const { data: subs } = await sb
    .from("forge_submissions")
    .select("recipe_id, status");
  const stats = new Map<string, Record<string, number>>();
  for (const s of (subs ?? []) as Array<{ recipe_id: string; status: string }>) {
    const m = stats.get(s.recipe_id) ?? {};
    m[s.status] = (m[s.status] ?? 0) + 1;
    stats.set(s.recipe_id, m);
  }

  return NextResponse.json({
    recipes: recipes.map((r) => ({ ...r, stats: stats.get(r.id) ?? {} })),
  });
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
    input = validateRecipeInput(body);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof InvalidRecipeError ? e.message : "Invalid input" },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();

  const { data: beforeRow } = await sb
    .from("forge_recipes")
    .select("id, enabled")
    .eq("id", input.id)
    .maybeSingle();

  const row = {
    id: input.id,
    title: input.title,
    subtitle: input.subtitle,
    description: input.description,
    inputs: input.inputs,
    input_image_url: input.inputImageUrl,
    input_moment_url: input.inputMomentUrl,
    reward_title: input.rewardTitle,
    reward_description: input.rewardDescription,
    reward_set_id: input.rewardSetId,
    reward_play_id: input.rewardPlayId,
    reward_image_url: input.rewardImageUrl,
    reward_moment_url: input.rewardMomentUrl,
    max_per_user: input.maxPerUser,
    max_total: input.maxTotal,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    accent_color: input.accentColor,
    enabled: input.enabled ?? true,
    require_sold_origin: input.requireSoldOrigin ?? false,
    craft_points: input.craftPoints ?? 0,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("forge_recipes")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void logAdminAction({
    actor: gate.address,
    action: beforeRow ? "forge_recipe.update" : "forge_recipe.create",
    targetType: "forge_recipe",
    targetId: input.id,
    before: beforeRow as Record<string, unknown> | null,
    after: row as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, recipe: mapRecipeRow(data as Record<string, unknown>) });
}
