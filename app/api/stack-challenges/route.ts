/**
 * GET /api/stack-challenges
 * ---------------------------------------------------------------------------
 * Public list of enabled stack challenges, newest first. Includes already-
 * settled (past) challenges so users can see results.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { mapChallengeRow } from "@/lib/stackChallenge";

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("stack_challenges")
    .select("*")
    .eq("enabled", true)
    .order("ends_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const challenges = (data ?? []).map((r) => mapChallengeRow(r as Record<string, unknown>));
  return NextResponse.json({ challenges });
}
