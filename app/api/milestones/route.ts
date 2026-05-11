/**
 * GET /api/milestones
 * ---------------------------------------------------------------------------
 * Public endpoint — returns all enabled milestones sorted by threshold.
 * No auth required; RLS on the table already limits to enabled=true rows.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("tsr_milestones")
    .select("id, threshold, reward_label, bonus_tsr, moment_description")
    .eq("enabled", true)
    .order("threshold", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ milestones: data ?? [] });
}
