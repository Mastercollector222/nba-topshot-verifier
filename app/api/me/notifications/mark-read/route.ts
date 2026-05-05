/**
 * POST /api/me/notifications/mark-read
 * ---------------------------------------------------------------------------
 * Marks notifications as read for the signed-in user.
 *
 * Body (JSON):
 *   { ids?: number[] }   — specific IDs to mark read
 *   {}                   — omit ids (or empty array) to mark ALL read
 *
 * Response: { updated: number }
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let ids: number[] | undefined;
  try {
    const body = (await req.json()) as { ids?: unknown };
    if (Array.isArray(body.ids) && body.ids.length > 0) {
      ids = body.ids.map(Number).filter((n) => !isNaN(n));
    }
  } catch {
    // empty body → mark all
  }

  const now = new Date().toISOString();
  const sb = supabaseAdmin();

  let query = sb
    .from("notifications")
    .update({ read_at: now })
    .eq("flow_address", address)
    .is("read_at", null);

  if (ids && ids.length > 0) {
    query = query.in("id", ids);
  }

  const { error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ updated: count ?? 0 });
}
