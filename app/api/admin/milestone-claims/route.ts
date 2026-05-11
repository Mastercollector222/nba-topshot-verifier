/**
 * /api/admin/milestone-claims
 * ---------------------------------------------------------------------------
 *   GET   → paginated list of all TSR milestone claims (all users). Admin only.
 *           Joins tsr_milestones to return threshold + reward_label inline.
 *   PATCH → { id, status } — mark a claim "pending" | "fulfilled". Admin only.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "50", 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const admin = supabaseAdmin();

  const { count, error: countErr } = await admin
    .from("tsr_milestone_claims")
    .select("*", { count: "exact", head: true });
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const { data, error } = await admin
    .from("tsr_milestone_claims")
    .select("id, flow_address, topshot_username, status, claimed_at, milestone_id, tsr_milestones(threshold, reward_label, bonus_tsr)")
    .order("claimed_at", { ascending: false })
    .range(from, to);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ claims: data ?? [], total, page, pageSize, totalPages });
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: { id?: unknown; status?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  const status = typeof body.status === "string" ? body.status : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!["pending", "fulfilled"].includes(status)) {
    return NextResponse.json({ error: "status must be pending or fulfilled" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("tsr_milestone_claims")
    .update({ status })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
