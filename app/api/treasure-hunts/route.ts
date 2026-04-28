/**
 * GET /api/treasure-hunts
 * ---------------------------------------------------------------------------
 * Returns every ENABLED hunt plus per-user evaluation. Drives the public
 * /treasure-hunt landing page.
 *
 * Response shape:
 *   {
 *     globalGate: { rule, earned } | null,
 *     hunts: HuntProgress[]
 *   }
 *
 * Only the global gate is enforced here as a "you can SEE the page"
 * boundary — the hunts list is always returned so the user can see what
 * they're working toward, but each hunt's `canEnter` accurately reflects
 * whether they could actually claim a slot.
 *
 * Auth: requires a signed-in session (sb-access cookie).
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
  type TreasureHunt,
} from "@/lib/treasureHunt";
import type { RewardRule } from "@/lib/verify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const sb = supabaseAdmin();

  // Fetch settings, hunts, and entries in parallel — all are independent.
  const [settingsRes, huntsRes, entriesRes] = await Promise.all([
    sb
      .from("treasure_hunt_settings")
      .select("global_gate")
      .eq("id", "default")
      .maybeSingle(),
    sb
      .from("treasure_hunts")
      .select("*")
      .eq("enabled", true)
      .order("ends_at", { ascending: true }),
    sb
      .from("treasure_hunt_entries")
      .select("hunt_id")
      .eq("flow_address", address),
  ]);

  if (settingsRes.error) {
    return NextResponse.json(
      { error: settingsRes.error.message },
      { status: 500 },
    );
  }
  if (huntsRes.error) {
    return NextResponse.json(
      { error: huntsRes.error.message },
      { status: 500 },
    );
  }
  if (entriesRes.error) {
    return NextResponse.json(
      { error: entriesRes.error.message },
      { status: 500 },
    );
  }

  const globalGate =
    (settingsRes.data?.global_gate ?? null) as RewardRule | null;
  const hunts: TreasureHunt[] = (huntsRes.data ?? []).map((row) =>
    mapHuntRow(row),
  );
  const enteredHuntIds = new Set(
    (entriesRes.data ?? []).map((r) => r.hunt_id as string),
  );

  // Read the user's snapshot via the shared paginating helper. Without
  // pagination, Supabase caps the response at 1000 rows and users with
  // large collections see partial data (earlier bug: Anthony Edwards
  // moments beyond row 1000 were invisible to the verifier).
  let moments: OwnedMoment[] = [];
  try {
    moments = await readOwnedMomentsSnapshot(sb, address);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Snapshot read failed" },
      { status: 500 },
    );
  }

  // No snapshot? Fall back to a live scan so first-time users get a
  // useful response. This is a slow path; the dashboard normally
  // populates the snapshot before the user lands here.
  if (moments.length === 0) {
    try {
      moments = await getAllMomentsForParent(address);
    } catch {
      // Tolerate; an empty `moments` just means every rule reads as
      // unearned, which is the correct UX.
    }
  }

  const globalGateEarned =
    globalGate == null ? null : isRuleEarned(globalGate, moments);

  const huntProgress = hunts.map((hunt) =>
    evaluateHunt({
      hunt,
      moments,
      hasEntered: enteredHuntIds.has(hunt.id),
    }),
  );

  return NextResponse.json({
    globalGate:
      globalGate == null
        ? null
        : { rule: globalGate, earned: globalGateEarned === true },
    hunts: huntProgress,
  });
}
