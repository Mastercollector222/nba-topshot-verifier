/**
 * GET /api/me/email/preferences   → current state
 * PATCH /api/me/email/preferences → update toggle / clear email
 * ---------------------------------------------------------------------------
 * GET returns: {
 *   email,                          // verified address or null
 *   pendingEmail,                   // unverified pending (if any)
 *   pendingExpiresAt,
 *   verifiedAt,
 *   notificationsEnabled,
 *   hasUnsubscribeToken,
 * }
 *
 * PATCH body: { notificationsEnabled?: boolean, clearEmail?: boolean }
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

interface UserRow {
  email: string | null;
  email_verified_at: string | null;
  email_notifications_enabled: boolean;
  unsubscribe_token: string | null;
}

interface PendingRow {
  email: string;
  expires_at: string;
}

export async function GET() {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const sb = supabaseAdmin();

  const [userRes, pendingRes] = await Promise.all([
    sb
      .from("users")
      .select(
        "email, email_verified_at, email_notifications_enabled, unsubscribe_token",
      )
      .eq("flow_address", address)
      .maybeSingle(),
    sb
      .from("email_verifications")
      .select("email, expires_at")
      .eq("flow_address", address)
      .is("consumed_at", null)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const u = (userRes.data as UserRow | null) ?? {
    email: null,
    email_verified_at: null,
    email_notifications_enabled: true,
    unsubscribe_token: null,
  };
  const p = pendingRes.data as PendingRow | null;

  return NextResponse.json({
    email: u.email,
    verifiedAt: u.email_verified_at,
    notificationsEnabled: u.email_notifications_enabled,
    hasUnsubscribeToken: !!u.unsubscribe_token,
    pendingEmail: p?.email ?? null,
    pendingExpiresAt: p?.expires_at ?? null,
  });
}

export async function PATCH(req: Request) {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  let body: { notificationsEnabled?: unknown; clearEmail?: unknown };
  try {
    body = (await req.json()) as { notificationsEnabled?: unknown; clearEmail?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (typeof body.notificationsEnabled === "boolean") {
    patch.email_notifications_enabled = body.notificationsEnabled;
  }
  if (body.clearEmail === true) {
    // Wipe email + verification timestamp. We KEEP unsubscribe_token in
    // case future re-subscription wants to reuse it (cheap, harmless).
    patch.email = null;
    patch.email_verified_at = null;
    // Also delete any pending verifications.
    await sb.from("email_verifications").delete().eq("flow_address", address);
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await sb.from("users").update(patch).eq("flow_address", address);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
