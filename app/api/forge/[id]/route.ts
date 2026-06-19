/**
 * GET /api/forge/[id]
 * ---------------------------------------------------------------------------
 * Public recipe detail. If a session exists, also returns:
 *   - `match`: which of the viewer's owned (unlocked) moments qualify for each
 *      input group, plus an auto-selected burn set and a `craftable` flag.
 *   - `submissions`: the viewer's own submissions for this recipe.
 *   - `remainingForUser` / `remainingTotal`: craft slots left.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionAddress } from "@/lib/admin";
import {
  mapRecipeRow,
  mapSubmissionRow,
  matchRecipe,
  loadOwnedMoments,
  countActiveSubmissions,
} from "@/lib/forge";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const sb = supabaseAdmin();

  const { data: row } = await sb
    .from("forge_recipes")
    .select("*")
    .eq("id", id)
    .eq("enabled", true)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const recipe = mapRecipeRow(row as Record<string, unknown>);

  const totalCrafted = await countActiveSubmissions(sb, recipe.id);
  const now = Date.now();
  const started = !recipe.startsAt || Date.parse(recipe.startsAt) <= now;
  const ended = !!recipe.endsAt && Date.parse(recipe.endsAt) <= now;
  const soldOut = recipe.maxTotal != null && totalCrafted >= recipe.maxTotal;

  const viewer = await getSessionAddress();
  let match = null;
  let submissions: ReturnType<typeof mapSubmissionRow>[] = [];
  let remainingForUser: number | null = null;

  if (viewer) {
    const owned = await loadOwnedMoments(sb, viewer);
    const m = matchRecipe(recipe, owned);
    match = {
      craftable: m.craftable,
      selectedMomentIds: m.selectedMomentIds,
      groups: m.groups.map((g) => ({
        index: g.index,
        group: g.group,
        satisfied: g.satisfied,
        selected: g.selected.map((mm) => ({
          momentID: mm.momentID,
          setID: mm.setID,
          playID: mm.playID,
          serialNumber: mm.serialNumber,
          setName: mm.setName,
          series: mm.series,
          thumbnail: mm.thumbnail,
          playerName: mm.playMetadata?.PlayerName ?? null,
          tier: mm.playMetadata?.Tier ?? null,
        })),
        candidateCount: g.candidates.length,
      })),
    };

    const { data: subRows } = await sb
      .from("forge_submissions")
      .select("*")
      .eq("recipe_id", recipe.id)
      .eq("flow_address", viewer)
      .order("created_at", { ascending: false });
    submissions = (subRows ?? []).map((r) => mapSubmissionRow(r as Record<string, unknown>));

    const userActive = await countActiveSubmissions(sb, recipe.id, viewer);
    remainingForUser = Math.max(0, recipe.maxPerUser - userActive);
  }

  return NextResponse.json({
    recipe: { ...recipe, totalCrafted },
    open: started && !ended && !soldOut,
    started,
    ended,
    soldOut,
    remainingTotal: recipe.maxTotal == null ? null : Math.max(0, recipe.maxTotal - totalCrafted),
    remainingForUser,
    match,
    submissions,
    signedIn: !!viewer,
  });
}
