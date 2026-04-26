/**
 * /api/me/topshot-username
 * ---------------------------------------------------------------------------
 *   GET   → returns `{ username: string | null, setAt: string | null }`
 *           for the currently signed-in user.
 *   POST  → body `{ username: string }`. Verifies via Top Shot's public
 *           GraphQL that the username belongs to the caller's Flow address,
 *           then upserts onto `users.topshot_username`.
 *   DELETE → unsets the user's stored username.
 *
 * All routes require a valid session cookie. Verification is the security
 * boundary — without it, anyone could claim any username.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import {
  TopShotUsernameError,
  verifyTopShotUsername,
} from "@/lib/topshotUsername";

export async function GET() {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("users")
    .select("topshot_username, topshot_username_set_at")
    .eq("flow_address", address)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    username: (data as { topshot_username: string | null } | null)
      ?.topshot_username ?? null,
    setAt:
      (data as { topshot_username_set_at: string | null } | null)
        ?.topshot_username_set_at ?? null,
  });
}

export async function POST(req: Request) {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const username =
    typeof (body as { username?: unknown })?.username === "string"
      ? ((body as { username: string }).username).trim()
      : "";
  if (!username) {
    return NextResponse.json(
      { error: "username is required" },
      { status: 400 },
    );
  }

  // Verify against Top Shot. Error codes are mapped to HTTP 400 (user
  // input problems) vs 502 (upstream issues) so the UI can render them
  // correctly without leaking internal details.
  let verified;
  try {
    verified = await verifyTopShotUsername(username, address);
  } catch (e) {
    if (e instanceof TopShotUsernameError) {
      const status = e.code === "upstream_error" ? 502 : 400;
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status },
      );
    }
    return NextResponse.json(
      { error: "Verification failed unexpectedly" },
      { status: 500 },
    );
  }

  // Upsert. Updates `topshot_username_set_at` on every successful save
  // so the admin can see when a user (re-)attached a username — useful
  // for spotting handle changes on the Top Shot side.
  const admin = supabaseAdmin();
  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("users")
    .upsert(
      {
        flow_address: address,
        topshot_username: verified.username,
        topshot_username_set_at: nowIso,
      },
      { onConflict: "flow_address" },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    username: verified.username,
    setAt: nowIso,
  });
}

export async function DELETE() {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const admin = supabaseAdmin();
  const { error } = await admin
    .from("users")
    .update({ topshot_username: null, topshot_username_set_at: null })
    .eq("flow_address", address);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
