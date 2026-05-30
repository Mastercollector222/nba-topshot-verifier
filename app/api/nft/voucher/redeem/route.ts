/**
 * app/api/nft/voucher/redeem/route.ts
 * ---------------------------------------------------------------------------
 * Marks a voucher as redeemed once the user's `claim` transaction is sealed
 * on Flow. Called from the /mint page after `fcl.tx(txId).onceSealed()`.
 *
 * The on-chain contract is the source of truth — this just keeps the
 * Supabase mirror in sync so the UI knows not to re-offer the tier.
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";

import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { nonce?: unknown; txId?: unknown };
  try {
    body = (await req.json()) as { nonce?: unknown; txId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const nonce = String(body.nonce ?? "");
  const txId = String(body.txId ?? "");
  if (!nonce || !txId) {
    return NextResponse.json({ error: "nonce and txId required" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("nft_badge_vouchers")
    .update({ redeemed: true, redeemed_at: new Date().toISOString(), redeemed_tx_id: txId })
    .eq("flow_address", address)
    .eq("nonce", nonce)
    .eq("redeemed", false)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[redeem]", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Voucher not found or already redeemed" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
