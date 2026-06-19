/**
 * /api/admin/forge/sold-moments
 * ---------------------------------------------------------------------------
 * Manage the allowlist of moment IDs that originated from us (e.g. moments
 * Mastercollector sold). Recipes with `require_sold_origin` only accept burns
 * of moments in this list.
 *
 *   GET    → list entries (newest first), with total count. Optional ?q= to
 *            filter by moment_id or note, ?limit= (default 200).
 *   POST   → bulk add. Body: { momentIds: string[] | string, note?: string }.
 *            `momentIds` may be an array or a blob to split on commas/whitespace.
 *   DELETE → bulk remove. Body: { momentIds: string[] }.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { logAdminAction } from "@/lib/adminAudit";

/** Parse an array or free-text blob into a clean, de-duped list of numeric ids. */
function parseMomentIds(raw: unknown): string[] {
  let parts: string[] = [];
  if (Array.isArray(raw)) {
    parts = raw.map((x) => String(x));
  } else if (typeof raw === "string") {
    parts = raw.split(/[\s,]+/);
  }
  const out = new Set<string>();
  for (const p of parts) {
    const t = p.trim();
    if (/^\d+$/.test(t)) out.add(t);
  }
  return [...out];
}

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit")) || 200));

  const sb = supabaseAdmin();

  const { count } = await sb
    .from("sold_moments")
    .select("*", { count: "exact", head: true });

  let query = sb
    .from("sold_moments")
    .select("moment_id, note, added_by, added_at")
    .order("added_at", { ascending: false })
    .limit(limit);
  if (q) query = query.or(`moment_id.ilike.%${q}%,note.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ total: count ?? 0, entries: data ?? [] });
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: { momentIds?: unknown; note?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = parseMomentIds(body.momentIds);
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Provide one or more numeric moment IDs" },
      { status: 400 },
    );
  }
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  const sb = supabaseAdmin();
  const rows = ids.map((moment_id) => ({
    moment_id,
    note,
    added_by: gate.address,
  }));

  const { error } = await sb
    .from("sold_moments")
    .upsert(rows, { onConflict: "moment_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void logAdminAction({
    actor: gate.address,
    action: "forge_sold_moments.add",
    targetType: "sold_moments",
    targetId: `${ids.length} ids`,
    after: { momentIds: ids, note } as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, added: ids.length });
}

export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: { momentIds?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = parseMomentIds(body.momentIds);
  if (ids.length === 0) {
    return NextResponse.json({ error: "Provide one or more moment IDs" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { error } = await sb.from("sold_moments").delete().in("moment_id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void logAdminAction({
    actor: gate.address,
    action: "forge_sold_moments.remove",
    targetType: "sold_moments",
    targetId: `${ids.length} ids`,
    after: { momentIds: ids } as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, removed: ids.length });
}
