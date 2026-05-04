/**
 * GET /api/me/topshot-username/check?u=<string>
 * ---------------------------------------------------------------------------
 * Live availability check for a Top Shot username.
 *
 * Returns { available: boolean }:
 *   true  — no other user has that username (case-insensitive)
 *   false — another user already owns it
 *
 * Special case: if the only matching row IS the current authenticated user,
 * the name is considered available (user is keeping their own username).
 *
 * Requires an active session. Returns 401 if not signed in, 400 if no query.
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const u = req.nextUrl.searchParams.get("u")?.trim() ?? "";
  if (!u) {
    return NextResponse.json({ error: "Missing u param" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("users")
    .select("flow_address")
    .ilike("topshot_username", u)
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // No match → available. Match is current user → also available.
  const available =
    !data ||
    (data as { flow_address: string }).flow_address.toLowerCase() ===
      address.toLowerCase();

  return NextResponse.json({ available });
}
