/**
 * POST /api/auth/nonce
 * ---------------------------------------------------------------------------
 * Body:  { address: string }   — Flow address the client intends to sign with
 * Reply: { nonce: string, messageHex: string, expiresAt: string }
 *
 * The client signs `messageHex` with `fcl.currentUser.signUserMessage` and
 * POSTs the resulting composite signatures to `/api/auth/verify`.
 *
 * The nonce is random (32 bytes), single-use, and expires in 5 minutes.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase";

const NONCE_TTL_MS = 5 * 60 * 1000;

function isValidFlowAddress(v: unknown): v is string {
  return typeof v === "string" && /^0x[0-9a-fA-F]{16}$/.test(v);
}

function toHex(s: string): string {
  return Buffer.from(s, "utf8").toString("hex");
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const address = (body as { address?: unknown })?.address;
  if (!isValidFlowAddress(address)) {
    return NextResponse.json(
      { error: "`address` must be a Flow address (0x + 16 hex)" },
      { status: 400 },
    );
  }
  const flowAddress = address.toLowerCase();

  const nonce = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);

  // Human-readable message — what the user sees in their wallet prompt.
  const message =
    `NBA Top Shot Verifier sign-in\n` +
    `Address: ${flowAddress}\n` +
    `Nonce: ${nonce}\n` +
    `Expires: ${expiresAt.toISOString()}`;

  const admin = supabaseAdmin();
  const { error } = await admin.from("auth_nonces").insert({
    nonce,
    flow_address: flowAddress,
    expires_at: expiresAt.toISOString(),
  });
  if (error) {
    return NextResponse.json(
      { error: `Could not issue nonce: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    nonce,
    messageHex: toHex(message),
    message,
    expiresAt: expiresAt.toISOString(),
  });
}
