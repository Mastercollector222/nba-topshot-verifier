/**
 * POST /api/me/email/subscribe
 * ---------------------------------------------------------------------------
 * Authenticated. Body: { email: string }.
 *
 * Begins the double opt-in flow:
 *   1. Validate email format and uniqueness (case-insensitive across users)
 *   2. Insert a row into email_verifications with a fresh token (TTL 1h)
 *   3. Send the confirmation email via Resend
 *
 * Until the user clicks the link in step 3, users.email is NOT updated and
 * the user does not receive challenge alerts. This protects against typos
 * and prevents one user from "subscribing" another person's address.
 *
 * Re-subscribing (e.g. fixing a typo before clicking the original link)
 * simply replaces the pending verification row.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { isValidEmail, randomToken, sendVerificationEmail } from "@/lib/email";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: Request) {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { email?: unknown };
  try {
    body = (await req.json()) as { email?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidEmail(body.email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 422 });
  }
  const email = body.email.trim().toLowerCase();

  const sb = supabaseAdmin();

  // Reject if a *different* user has already verified this address.
  const { data: collision } = await sb
    .from("users")
    .select("flow_address")
    .eq("email", email)
    .not("email_verified_at", "is", null)
    .neq("flow_address", address)
    .maybeSingle();
  if (collision) {
    return NextResponse.json(
      { error: "That email is already verified by another account." },
      { status: 409 },
    );
  }

  // Replace any existing pending verifications for this user.
  await sb.from("email_verifications").delete().eq("flow_address", address);

  const token = randomToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const { error: insErr } = await sb.from("email_verifications").insert({
    token,
    flow_address: address,
    email,
    expires_at: expiresAt,
  });
  if (insErr) {
    console.error("[email/subscribe] insert failed:", insErr);
    return NextResponse.json({ error: "Could not record verification" }, { status: 500 });
  }

  const result = await sendVerificationEmail(email, token);
  if (!result.ok && !result.skipped) {
    return NextResponse.json(
      { error: "Could not send verification email — please try again" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    pending: true,
    email,
    sent: result.ok,
    devSkipped: !!result.skipped, // visible in dev so you know RESEND_API_KEY isn't configured
  });
}
