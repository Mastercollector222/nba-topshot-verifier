/**
 * /api/admin/activity
 * ---------------------------------------------------------------------------
 *   GET ?limit=50&page=1&action=&actor=
 *       → paginated admin_actions rows, newest first.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
  const page  = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const from  = (page - 1) * limit;
  const to    = from + limit - 1;

  const actionFilter = url.searchParams.get("action") ?? "";
  const actorFilter  = url.searchParams.get("actor") ?? "";

  const sb = supabaseAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (q: any) => {
    if (actionFilter) q = q.eq("action", actionFilter);
    if (actorFilter)  q = q.eq("actor_address", actorFilter);
    return q;
  };

  const { count, error: countErr } = await applyFilters(
    sb.from("admin_actions").select("*", { count: "exact", head: true }),
  );
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });

  const { data, error } = await applyFilters(
    sb.from("admin_actions").select("*").order("created_at", { ascending: false }),
  ).range(from, to);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const total      = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return NextResponse.json({ actions: data ?? [], total, page, limit, totalPages });
}
