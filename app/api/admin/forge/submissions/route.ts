/**
 * /api/admin/forge/submissions
 * ---------------------------------------------------------------------------
 *   GET   → list forge submissions. Filters: ?status=, ?recipeId=, ?page=.
 *           Each row is decorated with its recipe summary. Page size 50.
 *   PATCH → update a submission by id:
 *             { id, status?, adminNote?, rewardTxId? }
 *           status ∈ burn_verified | reward_sent | rejected | pending_burn.
 *           Marking reward_sent stamps reward_sent_at.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { logAdminAction } from "@/lib/adminAudit";
import { createNotification } from "@/lib/notifications";
import { mapRecipeRow, mapSubmissionRow } from "@/lib/forge";

const VALID_STATUSES = [
  "pending_burn",
  "burn_verified",
  "reward_sent",
  "rejected",
  "cancelled",
];

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status") ?? "";
  const recipeFilter = url.searchParams.get("recipeId") ?? "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const sb = supabaseAdmin();

  let query = sb
    .from("forge_submissions")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });
  if (statusFilter && VALID_STATUSES.includes(statusFilter)) {
    query = query.eq("status", statusFilter);
  }
  if (recipeFilter) query = query.eq("recipe_id", recipeFilter);

  const { data, count, error } = await query.range(from, to);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const submissions = (data ?? []).map((r) => mapSubmissionRow(r as Record<string, unknown>));

  // Decorate with recipe summaries.
  const recipeIds = [...new Set(submissions.map((s) => s.recipeId))];
  const recipeMap = new Map<string, ReturnType<typeof mapRecipeRow>>();
  if (recipeIds.length > 0) {
    const { data: rRows } = await sb
      .from("forge_recipes")
      .select("*")
      .in("id", recipeIds);
    for (const r of rRows ?? []) {
      const rec = mapRecipeRow(r as Record<string, unknown>);
      recipeMap.set(rec.id, rec);
    }
  }

  // Status tallies across the whole table for the filter tabs.
  const { data: allRows } = await sb.from("forge_submissions").select("status");
  const stats: Record<string, number> = {};
  for (const r of (allRows ?? []) as Array<{ status: string }>) {
    stats[r.status] = (stats[r.status] ?? 0) + 1;
  }

  const total = count ?? 0;
  return NextResponse.json({
    submissions: submissions.map((s) => ({
      ...s,
      recipe: recipeMap.get(s.recipeId) ?? null,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    stats,
  });
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: {
    id?: unknown;
    status?: unknown;
    adminNote?: unknown;
    rewardTxId?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: beforeRow } = await sb
    .from("forge_submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!beforeRow) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.status === "string") {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    update.status = body.status;
    if (body.status === "reward_sent") update.reward_sent_at = new Date().toISOString();
    if (body.status === "burn_verified") update.burn_verified_at = new Date().toISOString();
  }
  if (typeof body.adminNote === "string") update.admin_note = body.adminNote;
  if (typeof body.rewardTxId === "string") update.reward_tx_id = body.rewardTxId;

  const { error } = await sb.from("forge_submissions").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const before = mapSubmissionRow(beforeRow as Record<string, unknown>);

  // Notify the user on meaningful transitions.
  if (update.status === "reward_sent") {
    void createNotification(sb, before.flowAddress, {
      kind: "challenge",
      title: "Forge reward sent!",
      body: "Your crafted moment has been airdropped to your wallet.",
      href: "/forge",
    });
  } else if (update.status === "rejected") {
    void createNotification(sb, before.flowAddress, {
      kind: "challenge",
      title: "Forge submission rejected",
      body: typeof body.adminNote === "string" && body.adminNote
        ? body.adminNote
        : "An admin reviewed your forge submission.",
      href: "/forge",
    });
  }

  void logAdminAction({
    actor: gate.address,
    action: "forge_submission.update",
    targetType: "forge_submission",
    targetId: id,
    before: beforeRow as Record<string, unknown>,
    after: update as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true });
}
