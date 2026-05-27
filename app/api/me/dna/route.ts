/**
 * /api/me/dna
 * ---------------------------------------------------------------------------
 *   GET   → returns the current user's Stack DNA (cached or freshly computed
 *           if the cache is missing/expired).
 *   POST  → forces a regeneration (manual "Refresh" button on the page).
 *
 * Auth required.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { getOrGenerateDna } from "@/lib/stackDna";

export async function GET() {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  try {
    const dna = await getOrGenerateDna(supabaseAdmin(), address, false);
    return NextResponse.json({ dna });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function POST() {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  try {
    const dna = await getOrGenerateDna(supabaseAdmin(), address, true);
    return NextResponse.json({ dna });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
