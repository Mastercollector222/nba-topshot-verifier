/**
 * GET /api/email/unsubscribe?token=...
 * ---------------------------------------------------------------------------
 * One-click unsubscribe link embedded in every challenge announcement
 * email. Possession of the unsubscribe_token IS the auth — it's a long
 * random string scoped to the user, stable across email changes.
 *
 * Sets email_notifications_enabled = false. Does NOT delete the email
 * address (so the user can re-enable from /notifications later).
 *
 * Redirects to /notifications?unsub=1 on success.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const PUBLIC_BASE =
  process.env.PUBLIC_BASE_URL ??
  process.env.NEXT_PUBLIC_BASE_URL ??
  "https://topshotcommunityrewards.com";

function redirect(ok: boolean) {
  const url = new URL("/notifications", PUBLIC_BASE);
  url.searchParams.set("unsub", ok ? "1" : "0");
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return redirect(false);

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("users")
    .update({ email_notifications_enabled: false })
    .eq("unsubscribe_token", token);
  if (error) {
    console.error("[email/unsubscribe] update failed:", error);
    return redirect(false);
  }
  return redirect(true);
}

// Some mail clients use POST for one-click unsubscribe (RFC 8058).
export async function POST(req: Request) {
  return GET(req);
}
