/**
 * POST /api/referral/capture
 * ---------------------------------------------------------------------------
 * Stores a referral code in an HttpOnly cookie (`tsr_ref`) so the next
 * /api/auth/verify call can attribute the referral when the visitor signs in.
 *
 * Body: { code: string } — must match /^[A-F0-9]{8}$/i (case-insensitive
 *         input is normalised to uppercase before storage).
 *
 * Idempotent: re-posting the same code overwrites the cookie. The cookie is
 * cleared automatically by /api/auth/verify after a successful sign-in.
 *
 * Note: this endpoint does NOT validate that the code resolves to a real
 * user (we don't want to leak code-existence to scrapers). Validation
 * happens at attribution time inside lib/referrals.attributeReferral.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

const COOKIE = "tsr_ref";
const TTL_DAYS = 90;

export async function POST(req: Request) {
  let body: { code?: unknown };
  try {
    body = (await req.json()) as { code?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!/^[A-F0-9]{8}$/.test(code)) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_DAYS * 24 * 60 * 60,
  });
  return res;
}
