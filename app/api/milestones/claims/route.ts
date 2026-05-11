/**
 * GET /api/milestones/claims
 * ---------------------------------------------------------------------------
 * Authenticated endpoint — returns the signed-in user's milestone claims.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, verifyFlowSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  const claims = token ? await verifyFlowSession(token) : null;
  if (!claims?.sub) {
    return NextResponse.json({ claims: [] });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("tsr_milestone_claims")
    .select("milestone_id, status, topshot_username, claimed_at")
    .eq("flow_address", claims.sub)
    .order("claimed_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ claims: data ?? [] });
}
