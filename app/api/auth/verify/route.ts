/**
 * POST /api/auth/verify
 * ---------------------------------------------------------------------------
 * Body:  { address, nonce, signatures: CompositeSignature[] }
 * Reply: { ok: true, address }  (also sets the `sb-access` httpOnly cookie)
 *
 * Flow:
 *   1. Verify the nonce row exists, matches `address`, isn't expired or
 *      consumed. Mark it consumed (single-use).
 *   2. Reconstruct the hex-encoded message the user signed (must match
 *      exactly what /api/auth/nonce returned).
 *   3. Ask the Flow access node (via `fcl.AppUtils.verifyUserSignatures`)
 *      whether `signatures` are valid for that message under `address`.
 *   4. On success: upsert the user row, mint a 7-day JWT with `sub = address`,
 *      set it as an httpOnly cookie named `sb-access`.
 *
 * All database writes use the service role key.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { fcl } from "@/lib/flow"; // importing configures FCL for mainnet
import { supabaseAdmin } from "@/lib/supabase";
import {
  signFlowSession,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "@/lib/session";

interface CompositeSignature {
  addr: string;
  keyId: number;
  signature: string;
  f_type?: string;
  f_vsn?: string;
}

interface VerifyBody {
  address?: unknown;
  nonce?: unknown;
  signatures?: unknown;
}

function isValidFlowAddress(v: unknown): v is string {
  return typeof v === "string" && /^0x[0-9a-fA-F]{16}$/.test(v);
}

function isCompositeSignatureArray(v: unknown): v is CompositeSignature[] {
  return (
    Array.isArray(v) &&
    v.every(
      (s) =>
        s &&
        typeof s === "object" &&
        typeof (s as CompositeSignature).addr === "string" &&
        typeof (s as CompositeSignature).keyId === "number" &&
        typeof (s as CompositeSignature).signature === "string",
    )
  );
}

function toHex(s: string): string {
  return Buffer.from(s, "utf8").toString("hex");
}

export async function POST(req: Request) {
  let body: VerifyBody;
  try {
    body = (await req.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { address, nonce, signatures } = body;
  if (!isValidFlowAddress(address)) {
    return NextResponse.json(
      { error: "Invalid `address`" },
      { status: 400 },
    );
  }
  if (typeof nonce !== "string" || nonce.length !== 64) {
    return NextResponse.json({ error: "Invalid `nonce`" }, { status: 400 });
  }
  if (!isCompositeSignatureArray(signatures)) {
    return NextResponse.json(
      { error: "Invalid `signatures`" },
      { status: 400 },
    );
  }

  const flowAddress = address.toLowerCase();
  const admin = supabaseAdmin();

  // 1. Load the nonce row, validate it strictly.
  const { data: nonceRow, error: nonceErr } = await admin
    .from("auth_nonces")
    .select("nonce, flow_address, expires_at, consumed_at")
    .eq("nonce", nonce)
    .maybeSingle();

  if (nonceErr) {
    return NextResponse.json(
      { error: `DB error: ${nonceErr.message}` },
      { status: 500 },
    );
  }
  if (!nonceRow) {
    return NextResponse.json({ error: "Unknown nonce" }, { status: 400 });
  }
  if (nonceRow.flow_address !== flowAddress) {
    return NextResponse.json(
      { error: "Nonce address mismatch" },
      { status: 400 },
    );
  }
  if (nonceRow.consumed_at) {
    return NextResponse.json(
      { error: "Nonce already consumed" },
      { status: 400 },
    );
  }
  if (new Date(nonceRow.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Nonce expired" }, { status: 400 });
  }

  // 2. Rebuild the message. Must byte-exact match /api/auth/nonce.
  const message =
    `NBA Top Shot Verifier sign-in\n` +
    `Address: ${flowAddress}\n` +
    `Nonce: ${nonce}\n` +
    `Expires: ${new Date(nonceRow.expires_at).toISOString()}`;
  const messageHex = toHex(message);

  // 3. Verify the signature on-chain via an FCL access-node query.
  let valid = false;
  try {
    valid = await fcl.AppUtils.verifyUserSignatures(messageHex, signatures);
  } catch (e) {
    return NextResponse.json(
      {
        error: `Signature verification failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      },
      { status: 400 },
    );
  }
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 },
    );
  }

  // Extra safety: ensure all returned composite signatures are for this addr.
  for (const s of signatures) {
    if (s.addr.toLowerCase().replace(/^0x/, "") !== flowAddress.replace(/^0x/, "")) {
      return NextResponse.json(
        { error: "Signature address mismatch" },
        { status: 401 },
      );
    }
  }

  // 4a. Mark nonce consumed.
  await admin
    .from("auth_nonces")
    .update({ consumed_at: new Date().toISOString() })
    .eq("nonce", nonce);

  // 4b. Upsert user.
  await admin.from("users").upsert(
    {
      flow_address: flowAddress,
      last_verified_at: new Date().toISOString(),
    },
    { onConflict: "flow_address" },
  );

  // 4c. Mint session JWT and set cookie.
  const token = await signFlowSession(flowAddress);
  const res = NextResponse.json({ ok: true, address: flowAddress });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
