/**
 * POST /api/treasure-hunts/[id]/enter
 * ---------------------------------------------------------------------------
 * Records the signed-in user as having completed every task in the hunt.
 * Server re-verifies eligibility from scratch — clients cannot fake an
 * entry. Idempotent: a second call returns 200 with the existing entry.
 *
 * Eligibility checks (all server-side):
 *   1. Caller is signed in.
 *   2. Hunt exists, is enabled, and `now` is within [starts_at, ends_at).
 *   3. The global gate (if set) is satisfied.
 *   4. The hunt's per-hunt gate (if set) is satisfied.
 *   5. EVERY task rule is earned.
 *
 * On success: upserts a row in treasure_hunt_entries with a snapshot of
 * matched task IDs (for audit if rules change later).
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { getAllMomentsForParent, type OwnedMoment } from "@/lib/topshot";
import {
  evaluateHunt,
  isRuleEarned,
  mapHuntRow,
  readOwnedMomentsSnapshot,
} from "@/lib/treasureHunt";
import type { RewardRule } from "@/lib/verify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing hunt id" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Fetch the hunt + global gate + existing entry in parallel.
  const [huntRes, settingsRes, existingRes] = await Promise.all([
    sb
      .from("treasure_hunts")
      .select("*")
      .eq("id", id)
      .eq("enabled", true)
      .maybeSingle(),
    sb
      .from("treasure_hunt_settings")
      .select("global_gate")
      .eq("id", "default")
      .maybeSingle(),
    sb
      .from("treasure_hunt_entries")
      .select("entered_at, matched_tasks")
      .eq("hunt_id", id)
      .eq("flow_address", address)
      .maybeSingle(),
  ]);

  if (huntRes.error) {
    return NextResponse.json({ error: huntRes.error.message }, { status: 500 });
  }
  if (!huntRes.data) {
    return NextResponse.json(
      { error: "Hunt not found or not enabled" },
      { status: 404 },
    );
  }
  if (existingRes.error) {
    return NextResponse.json(
      { error: existingRes.error.message },
      { status: 500 },
    );
  }

  // Idempotent: if user has already entered, just return success.
  if (existingRes.data) {
    return NextResponse.json({
      ok: true,
      alreadyEntered: true,
      enteredAt: existingRes.data.entered_at,
    });
  }

  const hunt = mapHuntRow(huntRes.data as Record<string, unknown>);
  const globalGate =
    (settingsRes.data?.global_gate ?? null) as RewardRule | null;

  // Pull moments from the DB snapshot via the shared paginating
  // helper (Supabase's default 1000-row cap would otherwise silently
  // drop moments for users with large collections). Fall back to a
  // live scan if no snapshot exists.
  let moments: OwnedMoment[] = [];
  try {
    moments = await readOwnedMomentsSnapshot(sb, address);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Snapshot read failed" },
      { status: 500 },
    );
  }
  if (moments.length === 0) {
    moments = await getAllMomentsForParent(address);
  }

  // Global gate check first — a failed global gate means the user
  // shouldn't even have seen the page.
  if (globalGate && !isRuleEarned(globalGate, moments)) {
    return NextResponse.json(
      { error: "Global access requirement not satisfied" },
      { status: 403 },
    );
  }

  // Run the full hunt evaluation (window + per-hunt gate + every task).
  const progress = evaluateHunt({ hunt, moments, hasEntered: false });
  if (!progress.isWithinWindow) {
    return NextResponse.json(
      { error: "Hunt is not currently active" },
      { status: 403 },
    );
  }
  if (progress.perHuntGateEarned === false) {
    return NextResponse.json(
      { error: "Per-hunt gate requirement not satisfied" },
      { status: 403 },
    );
  }
  if (!progress.allTasksComplete) {
    const remaining = progress.taskEvaluations.filter((e) => !e.earned).length;
    return NextResponse.json(
      {
        error: `${remaining} task${remaining === 1 ? "" : "s"} still incomplete`,
      },
      { status: 403 },
    );
  }

  // Snapshot which task IDs were earned at entry time (audit trail).
  const matchedTasks = progress.taskEvaluations
    .filter((e) => e.earned)
    .map((e) => e.rule.id);

  const { error: insErr } = await sb.from("treasure_hunt_entries").upsert(
    {
      hunt_id: id,
      flow_address: address,
      matched_tasks: matchedTasks,
      // entered_at defaults to now() server-side.
    },
    { onConflict: "hunt_id,flow_address" },
  );
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, alreadyEntered: false });
}
