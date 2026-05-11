/**
 * POST /api/milestones/claim
 * ---------------------------------------------------------------------------
 * Body: { milestoneId: string, topshotUsername: string }
 *
 * 1. Validates the user is signed in.
 * 2. Loads the milestone and checks it's enabled.
 * 3. Computes the user's current TSR total.
 * 4. Confirms TSR >= threshold.
 * 5. Inserts into tsr_milestone_claims (unique constraint prevents doubles).
 * 6. Awards bonus_tsr via tsr_adjustments.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, verifyFlowSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { getUserTsr } from "@/lib/tsr";

async function authed(): Promise<
  { ok: true; address: string } | { ok: false; res: NextResponse }
> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return { ok: false, res: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  }
  const claims = await verifyFlowSession(token);
  if (!claims?.sub) {
    return { ok: false, res: NextResponse.json({ error: "Invalid session" }, { status: 401 }) };
  }
  return { ok: true, address: claims.sub };
}

export async function POST(req: Request) {
  const auth = await authed();
  if (!auth.ok) return auth.res;
  const address = auth.address;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const milestoneId = b.milestoneId ? String(b.milestoneId) : null;
  const topshotUsername = b.topshotUsername ? String(b.topshotUsername).trim() : null;

  if (!milestoneId || !topshotUsername) {
    return NextResponse.json({ error: "milestoneId and topshotUsername are required" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Load the milestone
  const { data: milestone, error: mErr } = await sb
    .from("tsr_milestones")
    .select("*")
    .eq("id", milestoneId)
    .eq("enabled", true)
    .single();

  if (mErr || !milestone) {
    return NextResponse.json({ error: "Milestone not found or not enabled" }, { status: 404 });
  }

  // Check user TSR vs threshold
  const balance = await getUserTsr(address, sb);
  if (balance.total < milestone.threshold) {
    return NextResponse.json(
      { error: `Not enough TSR. Need ${milestone.threshold}, you have ${balance.total}.` },
      { status: 403 },
    );
  }

  // Insert claim (unique constraint on flow_address + milestone_id prevents duplicates)
  const { error: claimErr } = await sb.from("tsr_milestone_claims").insert({
    flow_address: address,
    milestone_id: milestoneId,
    topshot_username: topshotUsername,
    status: "pending",
  });

  if (claimErr) {
    if (claimErr.code === "23505") {
      return NextResponse.json({ error: "Already claimed this milestone." }, { status: 409 });
    }
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }

  // Award bonus TSR if any
  if (milestone.bonus_tsr > 0) {
    await sb.from("tsr_adjustments").insert({
      flow_address: address,
      points: milestone.bonus_tsr,
      reason: `Milestone claim: ${milestone.reward_label}`,
    });
  }

  return NextResponse.json({ ok: true, bonusTsr: milestone.bonus_tsr });
}
