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

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("reward_claims")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ claims: data ?? [] });
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
