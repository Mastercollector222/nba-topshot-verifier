/**
 * /api/admin/claims
 * ---------------------------------------------------------------------------
 *   GET   → list every claim (all users, all rules). Admin only.
 *   PATCH → `{ flowAddress, ruleId, status, adminNote? }` — update claim
 *           status (pending | sent | rejected). Admin only.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

interface ClaimRow {
  flow_address: string;
  rule_id: string;
  topshot_username: string;
  reward_label: string | null;
  reward_set_id: number | null;
  reward_play_id: number | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  ship_full_name: string | null;
  ship_address_line1: string | null;
  ship_address_line2: string | null;
  ship_city: string | null;
  ship_state: string | null;
  ship_postal_code: string | null;
  ship_country: string | null;
  ship_phone: string | null;
  ship_email: string | null;
  ship_notes: string | null;
  rule?: {
    is_physical: boolean;
    physical_title: string | null;
    physical_description: string | null;
    physical_image_url: string | null;
  };
}

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "50", 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const admin = supabaseAdmin();

  // Get total count first
  const { count, error: countErr } = await admin
    .from("reward_claims")
    .select("*", { count: "exact", head: true });
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Fetch claims with joined rule data for physical reward info
  const { data: rawClaims, error } = await admin
    .from("reward_claims")
    .select("*")
    .order("updated_at", { ascending: false })
    .range(from, to);

  // Fetch rule data for physical fields
  const ruleIds = [...new Set((rawClaims ?? []).map((c: Record<string, unknown>) => c.rule_id as string))];
  const { data: rulesData } = await admin
    .from("reward_rules")
    .select("id, is_physical, physical_title, physical_description, physical_image_url")
    .in("id", ruleIds);
  const ruleMap = new Map((rulesData ?? []).map((r: Record<string, unknown>) => [r.id, r]));

  const claims: ClaimRow[] = (rawClaims ?? []).map((c: Record<string, unknown>) => {
    const rule = ruleMap.get(c.rule_id as string) as ClaimRow["rule"] | undefined;
    return {
      ...c,
      rule,
    } as ClaimRow;
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ claims, total, page, pageSize, totalPages });
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: {
    flowAddress?: unknown;
    ruleId?: unknown;
    status?: unknown;
    adminNote?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const flowAddress =
    typeof body.flowAddress === "string" ? body.flowAddress : "";
  const ruleId = typeof body.ruleId === "string" ? body.ruleId : "";
  const status = typeof body.status === "string" ? body.status : "";
  if (!flowAddress || !ruleId) {
    return NextResponse.json(
      { error: "flowAddress and ruleId are required" },
      { status: 400 },
    );
  }
  if (!["pending", "sent", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("reward_claims")
    .update({
      status,
      admin_note:
        typeof body.adminNote === "string" ? body.adminNote : null,
      updated_at: new Date().toISOString(),
    })
    .eq("flow_address", flowAddress)
    .eq("rule_id", ruleId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
