/**
 * /api/admin/badges
 * ---------------------------------------------------------------------------
 *   GET  → list every badge in the catalog (admin overview)
 *   POST → create or update a badge (upsert by id)
 *
 * All routes are admin-gated via `requireAdmin()`. The `badges` table has
 * RLS that allows public reads (badges are decorative metadata), but
 * writes always go through the service role here.
 *
 * POST body: {
 *   id: string,                   // slug
 *   name: string,
 *   description?: string,
 *   imageUrl?: string,
 *   autoRuleIds?: string[],       // earning any of these rule ids auto-awards
 *   autoHuntIds?: string[],       // entering any of these hunts auto-awards
 * }
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { mapBadgeRow } from "@/lib/badges";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("badges")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    badges: (data ?? []).map((r) => mapBadgeRow(r as Record<string, unknown>)),
  });
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = body as {
    id?: unknown;
    name?: unknown;
    description?: unknown;
    imageUrl?: unknown;
    autoRuleIds?: unknown;
    autoHuntIds?: unknown;
  };

  // Slug-style id; no whitespace, basic punctuation only. Server is the
  // source of truth on shape so the admin UI can stay loose.
  const id = typeof b.id === "string" ? b.id.trim() : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!id || !/^[a-z0-9_-]{2,60}$/i.test(id)) {
    return NextResponse.json(
      { error: "id must be 2-60 chars: letters, digits, hyphen, underscore" },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const description =
    typeof b.description === "string" && b.description.trim()
      ? b.description.trim()
      : null;
  const imageUrl =
    typeof b.imageUrl === "string" && b.imageUrl.trim()
      ? b.imageUrl.trim()
      : null;
  const autoRuleIds = Array.isArray(b.autoRuleIds)
    ? (b.autoRuleIds as unknown[]).filter((x) => typeof x === "string").map(String)
    : [];
  const autoHuntIds = Array.isArray(b.autoHuntIds)
    ? (b.autoHuntIds as unknown[]).filter((x) => typeof x === "string").map(String)
    : [];

  const sb = supabaseAdmin();
  const { error } = await sb.from("badges").upsert(
    {
      id,
      name,
      description,
      image_url: imageUrl,
      auto_rule_ids: autoRuleIds,
      auto_hunt_ids: autoHuntIds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
