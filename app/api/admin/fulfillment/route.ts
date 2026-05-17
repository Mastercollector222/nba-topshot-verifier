/**
 * /api/admin/fulfillment
 * ---------------------------------------------------------------------------
 *   GET   → physical claims only (rule.is_physical = true), ordered by
 *           created_at asc. Supports ?status= filter
 *           (queued|packed|shipped|delivered|returned|all, default 'queued').
 *           Page size 50.
 *   PATCH → same body shape as /api/admin/claims PATCH.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { logAdminAction } from "@/lib/adminAudit";

const VALID_SHIPPING_STATUSES = [
  "not_required",
  "queued",
  "packed",
  "shipped",
  "delivered",
  "returned",
];

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status") ?? "queued";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const admin = supabaseAdmin();

  // Get all physical rule IDs first
  const { data: physicalRules, error: rulesErr } = await admin
    .from("reward_rules")
    .select("id, is_physical, physical_title, physical_description, physical_image_url")
    .eq("is_physical", true);
  if (rulesErr) return NextResponse.json({ error: rulesErr.message }, { status: 500 });

  const physicalRuleIds = (physicalRules ?? []).map((r: Record<string, unknown>) => r.id as string);
  if (physicalRuleIds.length === 0) {
    return NextResponse.json({ claims: [], total: 0, page, pageSize, totalPages: 1, stats: { queued: 0, packed: 0, shipped: 0, delivered: 0 } });
  }

  const ruleMap = new Map((physicalRules ?? []).map((r: Record<string, unknown>) => [r.id, r]));

  // Build query
  let query = admin
    .from("reward_claims")
    .select("*", { count: "exact" })
    .in("rule_id", physicalRuleIds)
    .order("created_at", { ascending: true });

  if (statusFilter !== "all") {
    query = query.eq("shipping_status", statusFilter);
  }

  const { data: rawClaims, count, error } = await query.range(from, to);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const claims = (rawClaims ?? []).map((c: Record<string, unknown>) => ({
    ...c,
    rule: ruleMap.get(c.rule_id as string),
  }));

  // Stat tiles: one extra query per status (cheap, physical rules only)
  const statuses = ["queued", "packed", "shipped", "delivered"] as const;
  const statResults = await Promise.all(
    statuses.map((s) =>
      admin
        .from("reward_claims")
        .select("*", { count: "exact", head: true })
        .in("rule_id", physicalRuleIds)
        .eq("shipping_status", s),
    ),
  );
  const stats = Object.fromEntries(
    statuses.map((s, i) => [s, statResults[i].count ?? 0]),
  );

  return NextResponse.json({ claims, total, page, pageSize, totalPages, stats });
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: {
    flowAddress?: unknown;
    ruleId?: unknown;
    status?: unknown;
    adminNote?: unknown;
    shippingStatus?: unknown;
    carrier?: unknown;
    trackingNumber?: unknown;
    trackingUrl?: unknown;
    shippedAt?: unknown;
    deliveredAt?: unknown;
    adminNoteInternal?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const flowAddress = typeof body.flowAddress === "string" ? body.flowAddress : "";
  const ruleId = typeof body.ruleId === "string" ? body.ruleId : "";
  if (!flowAddress || !ruleId) {
    return NextResponse.json({ error: "flowAddress and ruleId are required" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: beforeRow } = await admin
    .from("reward_claims")
    .select("status, shipping_status, carrier, tracking_number, tracking_url, admin_note_internal")
    .eq("flow_address", flowAddress)
    .eq("rule_id", ruleId)
    .maybeSingle();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.status === "string") {
    if (!["pending", "sent", "rejected"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    update.status = body.status;
  }
  if (typeof body.adminNote === "string") update.admin_note = body.adminNote;

  if (typeof body.shippingStatus === "string") {
    if (!VALID_SHIPPING_STATUSES.includes(body.shippingStatus)) {
      return NextResponse.json({ error: "Invalid shippingStatus" }, { status: 400 });
    }
    update.shipping_status = body.shippingStatus;
    if (body.shippingStatus === "shipped" && !body.shippedAt) {
      update.shipped_at = new Date().toISOString();
    }
    if (body.shippingStatus === "delivered" && !body.deliveredAt) {
      update.delivered_at = new Date().toISOString();
    }
  }

  if (typeof body.carrier === "string") update.carrier = body.carrier;
  if (typeof body.trackingNumber === "string") update.tracking_number = body.trackingNumber;
  if (typeof body.trackingUrl === "string") update.tracking_url = body.trackingUrl;
  if (typeof body.shippedAt === "string") update.shipped_at = body.shippedAt;
  if (typeof body.deliveredAt === "string") update.delivered_at = body.deliveredAt;
  if (typeof body.adminNoteInternal === "string") update.admin_note_internal = body.adminNoteInternal;

  const { error } = await admin
    .from("reward_claims")
    .update(update)
    .eq("flow_address", flowAddress)
    .eq("rule_id", ruleId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void logAdminAction({
    actor: gate.address,
    action: "claim.shipping_update",
    targetType: "reward_claim",
    targetId: `${flowAddress}/${ruleId}`,
    before: beforeRow as Record<string, unknown> | null,
    after: update as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true });
}
