/**
 * GET /api/search/moments?q=<string>
 * ---------------------------------------------------------------------------
 * Searches the signed-in user's owned_moments by:
 *   - Player name  (play_metadata->>'PlayerName')
 *   - Set name     (set_name)
 *   - Serial number (serial_number cast to text)
 *
 * Requires an active session; returns 401 if not signed in.
 * Returns up to 8 results.
 *
 * Response: { results: Array<{ momentId, player, setName, serial, tier }> }
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const sb = supabaseAdmin();

  // Search across three fields. Supabase doesn't support OR across
  // jsonb extraction with ilike in one filter, so we run three targeted
  // queries and merge in JS (collections are small enough that this is fine).
  const pattern = `%${q}%`;

  const [byPlayer, bySet, bySerial] = await Promise.all([
    sb
      .from("owned_moments")
      .select("moment_id, set_name, serial_number, play_metadata")
      .eq("flow_address", address)
      .ilike("play_metadata->>PlayerName", pattern)
      .limit(8),
    sb
      .from("owned_moments")
      .select("moment_id, set_name, serial_number, play_metadata")
      .eq("flow_address", address)
      .ilike("set_name", pattern)
      .limit(8),
    sb
      .from("owned_moments")
      .select("moment_id, set_name, serial_number, play_metadata")
      .eq("flow_address", address)
      .eq("serial_number", isNaN(Number(q)) ? -1 : Number(q))
      .limit(8),
  ]);

  type Row = {
    moment_id: string;
    set_name: string | null;
    serial_number: number;
    play_metadata: Record<string, string> | null;
  };

  // Merge and dedupe by moment_id, cap at 8.
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const res of [byPlayer, bySet, bySerial]) {
    for (const row of (res.data ?? []) as Row[]) {
      if (!seen.has(row.moment_id)) {
        seen.add(row.moment_id);
        rows.push(row);
      }
      if (rows.length >= 8) break;
    }
    if (rows.length >= 8) break;
  }

  const results = rows.map((r) => ({
    momentId: String(r.moment_id),
    player: r.play_metadata?.PlayerName ?? null,
    setName: r.set_name ?? null,
    serial: r.serial_number,
    tier: r.play_metadata?.Tier ?? null,
  }));

  return NextResponse.json({ results });
}
