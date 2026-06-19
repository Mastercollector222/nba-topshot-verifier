/**
 * POST /api/forge/[id]/submit
 * ---------------------------------------------------------------------------
 * Commit a burn set for a forge recipe. Body: { momentIds: string[] }.
 * If momentIds is omitted, the server auto-selects the lowest-serial
 * qualifying moments. Creates a `pending_burn` submission the user then
 * fulfills by burning those moments on Top Shot and confirming.
 *
 * Requires a signed-in session and a Top Shot username on file.
 * Enforces the recipe's time window + per-user / total craft caps.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionAddress } from "@/lib/admin";
import {
  mapRecipeRow,
  matchRecipe,
  validateBurnSelection,
  loadOwnedMoments,
  countActiveSubmissions,
  InvalidRecipeError,
} from "@/lib/forge";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Sign in to craft" }, { status: 401 });
  }

  const sb = supabaseAdmin();

  const { data: row } = await sb
    .from("forge_recipes")
    .select("*")
    .eq("id", id)
    .eq("enabled", true)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  const recipe = mapRecipeRow(row as Record<string, unknown>);

  // Time window.
  const now = Date.now();
  if (recipe.startsAt && Date.parse(recipe.startsAt) > now) {
    return NextResponse.json({ error: "This forge hasn't opened yet" }, { status: 400 });
  }
  if (recipe.endsAt && Date.parse(recipe.endsAt) <= now) {
    return NextResponse.json({ error: "This forge has closed" }, { status: 400 });
  }

  // Caps.
  const [userActive, totalActive] = await Promise.all([
    countActiveSubmissions(sb, recipe.id, address),
    countActiveSubmissions(sb, recipe.id),
  ]);
  if (userActive >= recipe.maxPerUser) {
    return NextResponse.json(
      { error: `You've reached the limit of ${recipe.maxPerUser} craft(s) for this recipe` },
      { status: 400 },
    );
  }
  if (recipe.maxTotal != null && totalActive >= recipe.maxTotal) {
    return NextResponse.json({ error: "This forge is sold out" }, { status: 400 });
  }

  // Top Shot username (needed so admin can airdrop).
  const { data: user } = await sb
    .from("users")
    .select("topshot_username")
    .eq("flow_address", address)
    .maybeSingle();
  const tsUser = (user as { topshot_username: string | null } | null)?.topshot_username ?? null;
  if (!tsUser) {
    return NextResponse.json(
      { error: "Add your Top Shot username to your profile before crafting" },
      { status: 400 },
    );
  }

  // Resolve the burn set.
  let body: { momentIds?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // empty body → auto-select
  }

  const owned = await loadOwnedMoments(sb, address);

  let momentIds: string[];
  try {
    if (Array.isArray(body.momentIds) && body.momentIds.length > 0) {
      momentIds = validateBurnSelection(
        recipe,
        owned,
        body.momentIds.map((x) => String(x)),
      );
    } else {
      const m = matchRecipe(recipe, owned);
      if (!m.craftable) {
        return NextResponse.json(
          { error: "You don't own enough qualifying moments to craft this yet" },
          { status: 400 },
        );
      }
      momentIds = m.selectedMomentIds;
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof InvalidRecipeError ? e.message : "Invalid selection" },
      { status: 400 },
    );
  }

  // Guard: a committed-but-not-yet-burned moment can't be pledged twice.
  const { data: openSubs } = await sb
    .from("forge_submissions")
    .select("committed_moment_ids")
    .eq("flow_address", address)
    .eq("status", "pending_burn");
  const alreadyPledged = new Set<string>();
  for (const s of (openSubs ?? []) as Array<{ committed_moment_ids: unknown[] }>) {
    for (const x of s.committed_moment_ids ?? []) alreadyPledged.add(String(x));
  }
  const clash = momentIds.find((mid) => alreadyPledged.has(mid));
  if (clash) {
    return NextResponse.json(
      { error: `Moment ${clash} is already pledged to another pending forge` },
      { status: 400 },
    );
  }

  const { data: inserted, error } = await sb
    .from("forge_submissions")
    .insert({
      recipe_id: recipe.id,
      flow_address: address,
      topshot_username: tsUser,
      committed_moment_ids: momentIds,
      status: "pending_burn",
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    submissionId: (inserted as { id: string }).id,
    committedMomentIds: momentIds,
  });
}
