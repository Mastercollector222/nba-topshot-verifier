/**
 * /api/forge/submissions/[id]
 * ---------------------------------------------------------------------------
 *   POST   → confirm the burn. Runs a LIVE on-chain check that none of the
 *            committed moment IDs remain in the user's custody. On success the
 *            submission flips to `burn_verified` and lands in the admin queue
 *            for the reward airdrop.
 *   DELETE → cancel a still-pending submission (releases the pledged moments).
 *
 * Both require the session address to own the submission.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionAddress } from "@/lib/admin";
import { createNotification } from "@/lib/notifications";
import { mapSubmissionRow, verifyBurn } from "@/lib/forge";

async function loadOwnedSubmission(id: string, address: string) {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("forge_submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const sub = mapSubmissionRow(data as Record<string, unknown>);
  if (sub.flowAddress !== address) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { sub };
}

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const address = await getSessionAddress();
  if (!address) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const { sub, error } = await loadOwnedSubmission(id, address);
  if (error) return error;
  if (sub!.status !== "pending_burn") {
    return NextResponse.json(
      { error: `This submission is already ${sub!.status.replace("_", " ")}` },
      { status: 400 },
    );
  }

  // Live on-chain burn check.
  let check;
  try {
    check = await verifyBurn(address, sub!.committedMomentIds);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Burn check failed" },
      { status: 502 },
    );
  }

  if (!check.allGone) {
    return NextResponse.json(
      {
        ok: false,
        verified: false,
        stillOwned: check.stillOwned,
        error:
          `${check.stillOwned.length} of your committed moment(s) are still in your wallet. ` +
          "Burn them on Top Shot, then confirm again.",
      },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();
  const { error: updErr } = await sb
    .from("forge_submissions")
    .update({
      status: "burn_verified",
      burn_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending_burn");
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Drop the burned moments from the cached snapshot so the UI updates fast.
  await sb
    .from("owned_moments")
    .delete()
    .eq("flow_address", address)
    .in("moment_id", sub!.committedMomentIds);

  void createNotification(sb, address, {
    kind: "challenge",
    title: "Burn confirmed!",
    body: "Your forge moments were burned. The reward will be airdropped soon.",
    href: "/forge",
  });

  return NextResponse.json({ ok: true, verified: true });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const address = await getSessionAddress();
  if (!address) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const { sub, error } = await loadOwnedSubmission(id, address);
  if (error) return error;
  if (sub!.status !== "pending_burn") {
    return NextResponse.json(
      { error: "Only pending submissions can be cancelled" },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();
  const { error: updErr } = await sb
    .from("forge_submissions")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending_burn");
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
