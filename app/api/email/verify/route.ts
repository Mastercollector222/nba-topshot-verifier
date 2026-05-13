/**
 * GET /api/email/verify?token=...
 * ---------------------------------------------------------------------------
 * Public link target from the verification email. Looks up the token,
 * checks freshness, sets users.email + users.email_verified_at, generates
 * a stable unsubscribe_token if not already present, and redirects the
 * user to /notifications?verified=1 with a success toast.
 *
 * Errors redirect to /notifications?verified=0&reason=<code> so the page
 * can render an inline message ("token expired", "already used", etc.).
 *
 * NOT authenticated — possession of the token IS the auth, exactly like
 * other email verification flows.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { randomToken } from "@/lib/email";

const PUBLIC_BASE =
  process.env.PUBLIC_BASE_URL ??
  process.env.NEXT_PUBLIC_BASE_URL ??
  "https://topshotcommunityrewards.com";

function redirect(reason: string, ok: boolean) {
  const url = new URL("/notifications", PUBLIC_BASE);
  url.searchParams.set("verified", ok ? "1" : "0");
  if (!ok) url.searchParams.set("reason", reason);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return redirect("missing", false);

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from("email_verifications")
    .select("token, flow_address, email, expires_at, consumed_at")
    .eq("token", token)
    .maybeSingle();
  if (!row) return redirect("invalid", false);
  const r = row as {
    token: string;
    flow_address: string;
    email: string;
    expires_at: string;
    consumed_at: string | null;
  };
  if (r.consumed_at) return redirect("used", false);
  if (Date.parse(r.expires_at) < Date.now()) return redirect("expired", false);

  // Mark consumed first so a clicked-twice retry doesn't double-update users.
  const { error: consumeErr } = await sb
    .from("email_verifications")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token", token)
    .is("consumed_at", null);
  if (consumeErr) {
    console.error("[email/verify] consume failed:", consumeErr);
    return redirect("server", false);
  }

  // Ensure the user has an unsubscribe_token (stable across email changes).
  const { data: userRow } = await sb
    .from("users")
    .select("unsubscribe_token")
    .eq("flow_address", r.flow_address)
    .maybeSingle();
  const unsub =
    (userRow as { unsubscribe_token: string | null } | null)?.unsubscribe_token ??
    randomToken();

  const { error: updErr } = await sb
    .from("users")
    .update({
      email: r.email,
      email_verified_at: new Date().toISOString(),
      email_notifications_enabled: true,
      unsubscribe_token: unsub,
    })
    .eq("flow_address", r.flow_address);
  if (updErr) {
    console.error("[email/verify] update users failed:", updErr);
    return redirect("server", false);
  }

  return redirect("ok", true);
}
