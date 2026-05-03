/**
 * PATCH /api/admin/users
 * ---------------------------------------------------------------------------
 * Admin-only endpoint for user profile moderation.
 * Currently supports:
 *   { action: "clear_avatar", address: string }
 *   { action: "clear_bio",    address: string }
 *
 * Returns { ok: true } on success.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

function normalizeAddress(v: string): string | null {
  const t = v.trim().toLowerCase();
  return /^0x[0-9a-f]{16}$/.test(t) ? t : null;
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action;
  const address = normalizeAddress(String(body.address ?? ""));

  if (!address) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  if (action === "clear_avatar") {
    const { error } = await sb
      .from("users")
      .update({ avatar_url: null })
      .eq("flow_address", address);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "clear_bio") {
    const { error } = await sb
      .from("users")
      .update({ bio: null })
      .eq("flow_address", address);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
