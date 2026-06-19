/**
 * GET /api/forge
 * ---------------------------------------------------------------------------
 * Public list of enabled forge recipes, newest first. Each recipe is
 * decorated with `totalCrafted` (submissions that count toward the total cap)
 * and an `open` flag derived from its time window.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { mapRecipeRow } from "@/lib/forge";

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("forge_recipes")
    .select("*")
    .eq("enabled", true)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const recipes = (data ?? []).map((r) => mapRecipeRow(r as Record<string, unknown>));

  // Tally crafted counts in one query.
  const { data: subs } = await sb
    .from("forge_submissions")
    .select("recipe_id, status")
    .in("status", ["pending_burn", "burn_verified", "reward_sent"]);
  const crafted = new Map<string, number>();
  for (const s of (subs ?? []) as Array<{ recipe_id: string }>) {
    crafted.set(s.recipe_id, (crafted.get(s.recipe_id) ?? 0) + 1);
  }

  const now = Date.now();
  const out = recipes.map((r) => {
    const started = !r.startsAt || Date.parse(r.startsAt) <= now;
    const ended = !!r.endsAt && Date.parse(r.endsAt) <= now;
    const totalCrafted = crafted.get(r.id) ?? 0;
    const soldOut = r.maxTotal != null && totalCrafted >= r.maxTotal;
    return { ...r, totalCrafted, open: started && !ended && !soldOut, started, ended, soldOut };
  });

  return NextResponse.json({ recipes: out });
}
