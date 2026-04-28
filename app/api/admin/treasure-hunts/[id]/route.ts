/**
 * /api/admin/treasure-hunts/[id]
 * ---------------------------------------------------------------------------
 *   DELETE → delete a hunt by id. Cascades to `treasure_hunt_entries`
 *            via the FK ON DELETE CASCADE in schema.sql.
 *
 * GET/POST for the collection live one level up; updates are POST-upsert
 * against the parent route, not a separate PUT here, to keep the admin
 * UI surface small.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  // Next 16 passes route params via a Promise (per the docs in
  // node_modules/next/dist/docs/...). Always await.
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { error } = await sb.from("treasure_hunts").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
