/**
 * GET /api/me/notifications?unread=true
 * ---------------------------------------------------------------------------
 * Returns up to 10 most-recent notifications for the signed-in user.
 *
 * Query params:
 *   unread=true  → only rows where read_at IS NULL
 *
 * Response: { items: NotificationItem[], unreadCount: number }
 *
 * NotificationItem:
 *   { id, kind, title, body, href, createdAt, readAt }
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "true";

  const sb = supabaseAdmin();

  // Total unread count (always, regardless of unread filter).
  const { count: unreadCount } = await sb
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("flow_address", address)
    .is("read_at", null);

  let query = sb
    .from("notifications")
    .select("id, kind, title, body, href, created_at, read_at")
    .eq("flow_address", address)
    .order("created_at", { ascending: false })
    .limit(10);

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data ?? []).map((r) => ({
    id: r.id as number,
    kind: r.kind as string,
    title: r.title as string,
    body: (r.body ?? null) as string | null,
    href: (r.href ?? null) as string | null,
    createdAt: r.created_at as string,
    readAt: (r.read_at ?? null) as string | null,
  }));

  return NextResponse.json({ items, unreadCount: unreadCount ?? 0 });
}
