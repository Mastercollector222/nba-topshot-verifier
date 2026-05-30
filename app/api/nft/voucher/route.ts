/**
 * app/api/nft/voucher/route.ts
 * ---------------------------------------------------------------------------
 * Issues TSR Milestone Badge NFT claim vouchers.
 *
 *   GET  → returns the caller's eligibility status: TSR balance, tiers
 *          they qualify for, tiers already claimed (server-side mirror),
 *          and any pending unredeemed voucher.
 *
 *   POST { tier: 1..5 }
 *        → if eligible, signs and persists a fresh voucher, returns the
 *          fields the user submits to the on-chain `claim` transaction.
 *
 * The Cadence contract is the ultimate source of truth — it enforces
 * nonce uniqueness and per-(address, tier) deduplication. This API just
 * mirrors that state for fast UI lookups + rate-limits voucher issuance.
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";

import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { getUserTsr } from "@/lib/tsr";
import { signVoucher, getConfiguredPublicKeyHex } from "@/lib/flowVoucher";

export const dynamic = "force-dynamic";

const TIER_THRESHOLDS: Record<number, number> = {
  1: 1_000,    // Bronze
  2: 5_000,    // Silver
  3: 10_000,   // Gold
  4: 50_000,   // Platinum
  5: 100_000,  // Diamond
};

const TIER_NAMES: Record<number, string> = {
  1: "Bronze",
  2: "Silver",
  3: "Gold",
  4: "Platinum",
  5: "Diamond",
};

const VOUCHER_TTL_SECONDS = 600; // 10 minutes — generous for slow signers

interface VoucherRow {
  tier: number;
  redeemed: boolean;
  expires_at: string;
}

async function loadStatus(address: string) {
  const sb = supabaseAdmin();
  const { total } = await getUserTsr(address, sb);

  // Active (unredeemed, not yet expired) vouchers.
  const { data: vouchers } = await sb
    .from("nft_badge_vouchers")
    .select("tier, redeemed, expires_at")
    .eq("flow_address", address);

  const rows = (vouchers ?? []) as VoucherRow[];
  const now = Date.now();
  const claimedTiers = new Set(rows.filter((r) => r.redeemed).map((r) => r.tier));
  const pendingByTier = new Map<number, VoucherRow>();
  for (const r of rows) {
    if (r.redeemed) continue;
    if (new Date(r.expires_at).getTime() <= now) continue;
    pendingByTier.set(r.tier, r);
  }

  const tiers = Object.keys(TIER_THRESHOLDS).map(Number).map((tier) => ({
    tier,
    name: TIER_NAMES[tier],
    threshold: TIER_THRESHOLDS[tier],
    eligible: total >= TIER_THRESHOLDS[tier],
    claimed: claimedTiers.has(tier),
    hasPendingVoucher: pendingByTier.has(tier),
  }));

  return { tsrTotal: total, tiers };
}

// =================================================================== GET ==

export async function GET() {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  try {
    const status = await loadStatus(address);
    return NextResponse.json({
      address,
      voucherPublicKey: getConfiguredPublicKeyHex(),
      ...status,
    });
  } catch (e) {
    console.error("[/api/nft/voucher GET]", e);
    return NextResponse.json({ error: "Failed to load status" }, { status: 500 });
  }
}

// ================================================================== POST ==

export async function POST(req: NextRequest) {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { tier?: unknown; recipient?: unknown };
  try {
    body = (await req.json()) as { tier?: unknown; recipient?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tier = Number(body.tier);
  if (!Number.isInteger(tier) || tier < 1 || tier > 5) {
    return NextResponse.json({ error: "Invalid tier (must be 1..5)" }, { status: 400 });
  }

  // Recipient may differ from the session user (e.g. TSR earned on Dapper but
  // NFT received in Flow Wallet). Defaults to the session address.
  let recipient = address;
  if (typeof body.recipient === "string" && body.recipient.trim()) {
    const candidate = body.recipient.trim().toLowerCase();
    const normalized = candidate.startsWith("0x") ? candidate : `0x${candidate}`;
    if (!/^0x[0-9a-f]{16}$/.test(normalized)) {
      return NextResponse.json(
        { error: "Recipient must be a Flow address (0x + 16 hex chars)" },
        { status: 400 },
      );
    }
    recipient = normalized;
  }

  const sb = supabaseAdmin();

  try {
    // Eligibility check — TSR balance is tied to the SESSION user, not the
    // recipient. The session user is the one "earning" the badge.
    const { total } = await getUserTsr(address, sb);
    const threshold = TIER_THRESHOLDS[tier];
    if (total < threshold) {
      return NextResponse.json(
        {
          error: `Need ${threshold.toLocaleString()} TSR for ${TIER_NAMES[tier]}; you have ${total.toLocaleString()}.`,
        },
        { status: 403 },
      );
    }

    // "Already claimed" check is against the RECIPIENT, since the on-chain
    // contract enforces uniqueness per recipient (not per earner).
    const { data: existing } = await sb
      .from("nft_badge_vouchers")
      .select("redeemed, expires_at")
      .eq("flow_address", recipient)
      .eq("tier", tier);

    const claimed = (existing ?? []).some((r) => r.redeemed);
    if (claimed) {
      return NextResponse.json(
        { error: "You've already claimed this tier." },
        { status: 409 },
      );
    }

    // Reuse a still-valid pending voucher rather than issuing a duplicate.
    const now = Date.now();
    const stillValid = (existing ?? []).find(
      (r) => !r.redeemed && new Date(r.expires_at).getTime() > now + 30_000,
    );
    if (stillValid) {
      const { data: full } = await sb
        .from("nft_badge_vouchers")
        .select("nonce, expires_at, signature_hex, tsr_at_issue")
        .eq("flow_address", recipient)
        .eq("tier", tier)
        .eq("redeemed", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (full) {
        return NextResponse.json({
          tier,
          tsrAtMint: String(full.tsr_at_issue),
          nonce: String(full.nonce),
          expiresAt: Math.floor(new Date(full.expires_at).getTime() / 1000),
          signatureHex: full.signature_hex,
          recipient,
          reused: true,
        });
      }
    }

    // Issue a fresh voucher.
    const voucher = signVoucher({
      recipient,
      tier,
      tsrAtMint: total,
      ttlSeconds: VOUCHER_TTL_SECONDS,
    });

    const { error: insertErr } = await sb.from("nft_badge_vouchers").insert({
      flow_address: recipient,
      tier,
      tsr_at_issue: total,
      // nonce stored as numeric(20,0) — pass as string to preserve precision.
      nonce: voucher.nonce.toString(),
      expires_at: new Date(Number(voucher.expiresAt) * 1000).toISOString(),
      signature_hex: voucher.signatureHex,
    });
    if (insertErr) throw insertErr;

    return NextResponse.json({
      tier: voucher.tier,
      tsrAtMint: voucher.tsrAtMint.toString(),
      nonce: voucher.nonce.toString(),
      expiresAt: Number(voucher.expiresAt),
      signatureHex: voucher.signatureHex,
      recipient: voucher.recipient,
      reused: false,
    });
  } catch (e) {
    console.error("[/api/nft/voucher POST]", e);
    return NextResponse.json({ error: "Failed to issue voucher" }, { status: 500 });
  }
}
