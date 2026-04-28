/**
 * /api/admin/treasure-hunts/[id]/entries
 * ---------------------------------------------------------------------------
 *   GET → list every entry for a hunt, with username (if known). Admin
 *         uses this to manually pick a winner once the hunt closes.
 *
 * Response: { entries: Array<{ flowAddress, username, enteredAt }> }
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("treasure_hunt_entries")
    .select("flow_address, entered_at")
    .eq("hunt_id", id)
    .order("entered_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Best-effort username lookup. We tolerate a join failure (e.g. when
  // running before the users table has any rows) and fall back to just
  // address-only entries.
  const addrs = (data ?? []).map((r) => r.flow_address as string);
  let usernames: Record<string, string | null> = {};
  if (addrs.length > 0) {
    const { data: users } = await sb
      .from("users")
      .select("flow_address, topshot_username")
      .in("flow_address", addrs);
    for (const u of users ?? []) {
      usernames[u.flow_address as string] =
        (u.topshot_username as string | null) ?? null;
    }
  }

  const entries = (data ?? []).map((r) => ({
    flowAddress: r.flow_address as string,
    enteredAt: r.entered_at as string,
    username: usernames[r.flow_address as string] ?? null,
  }));
  return NextResponse.json({ entries });
}
