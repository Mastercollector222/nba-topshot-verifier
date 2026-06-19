/**
 * /api/admin/forge/[id]
 * ---------------------------------------------------------------------------
 *   DELETE → remove a forge recipe (cascades its submissions).
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
  const { error } = await sb.from("forge_recipes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void logAdminAction({
    actor: gate.address,
    action: "forge_recipe.delete",
    targetType: "forge_recipe",
    targetId: id,
    before: null,
    after: null,
  });

  return NextResponse.json({ ok: true });
}
