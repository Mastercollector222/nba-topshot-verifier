/**
 * DELETE /api/admin/stack-challenges/[id]
 * ---------------------------------------------------------------------------
 * Removes a stack challenge entirely. Does NOT clean up any reward_claims
 * that may have been auto-created on settle.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { logAdminAction } from "@/lib/adminAudit";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const sb = supabaseAdmin();

  const { data: beforeRow } = await sb
    .from("stack_challenges")
    .select("id, title, set_id, play_id, enabled")
    .eq("id", id)
    .maybeSingle();

  const { error } = await sb.from("stack_challenges").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void logAdminAction({
    actor: gate.address,
    action: "stack_challenge.delete",
    targetType: "stack_challenge",
    targetId: id,
    before: beforeRow as Record<string, unknown> | null,
    after: null,
  });

  return NextResponse.json({ ok: true });
}
