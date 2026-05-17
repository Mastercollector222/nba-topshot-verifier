/**
 * /api/admin/stats/new-users
 * ---------------------------------------------------------------------------
 *   GET ?days=7 → { count } of users whose onboarding_completed_at is within
 *   the last N days. Falls back to created_at if the column is unavailable.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const days = Math.max(1, parseInt(url.searchParams.get("days") ?? "7", 10));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const admin = supabaseAdmin();

  const { count, error } = await admin
    .from("users")
    .select("*", { count: "exact", head: true })
    .gte("onboarding_completed_at", since);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ count: count ?? 0, days });
}
