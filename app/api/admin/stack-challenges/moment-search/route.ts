/**
 * GET /api/admin/stack-challenges/moment-search?q=<player|set>
 * ---------------------------------------------------------------------------
 * Searches the system-wide owned_moments table (across all users) for a
 * moment matching the query string and returns DISTINCT (set_id, play_id)
 * candidates with display metadata. Admin-only.
 *
 * Returned shape: { results: [{ setId, playId, setName, playerName,
 *   series, tier, thumbnailUrl, ownerCount }] }
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

interface MomentRow {
  set_id:        number;
  play_id:       number;
  set_name:      string | null;
  series:        number | null;
  thumbnail:     string | null;
  flow_address:  string;
  play_metadata: Record<string, string> | null;
}

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const sb = supabaseAdmin();
  const pattern = `%${q}%`;

  // Pull a generous sample matching either player name or set name; we
  // dedupe by (set_id, play_id) and tally owners. Cap at 5000 raw rows so
  // a vague query like "the" doesn't blow up.
  const [byPlayer, bySet] = await Promise.all([
    sb
      .from("owned_moments")
      .select("set_id, play_id, set_name, series, thumbnail, flow_address, play_metadata")
      .ilike("play_metadata->>PlayerName", pattern)
      .limit(2500),
    sb
      .from("owned_moments")
      .select("set_id, play_id, set_name, series, thumbnail, flow_address, play_metadata")
      .ilike("set_name", pattern)
      .limit(2500),
  ]);

  const rows = [
    ...((byPlayer.data ?? []) as MomentRow[]),
    ...((bySet.data    ?? []) as MomentRow[]),
  ];

  // Group by (set_id, play_id), count distinct owners.
  const grouped = new Map<string, {
    setId: number;
    playId: number;
    setName: string | null;
    series: number | null;
    thumbnailUrl: string | null;
    playerName: string | null;
    tier: string | null;
    owners: Set<string>;
  }>();

  for (const r of rows) {
    const key = `${r.set_id}/${r.play_id}`;
    let entry = grouped.get(key);
    if (!entry) {
      entry = {
        setId:        r.set_id,
        playId:       r.play_id,
        setName:      r.set_name,
        series:       r.series,
        thumbnailUrl: r.thumbnail,
        playerName:   r.play_metadata?.PlayerName ?? null,
        tier:         r.play_metadata?.Tier ?? null,
        owners:       new Set(),
      };
      grouped.set(key, entry);
    }
    entry.owners.add(r.flow_address);
  }

  const results = [...grouped.values()]
    .map((g) => ({
      setId:        g.setId,
      playId:       g.playId,
      setName:      g.setName,
      playerName:   g.playerName,
      series:       g.series,
      tier:         g.tier,
      thumbnailUrl: g.thumbnailUrl,
      ownerCount:   g.owners.size,
    }))
    .sort((a, b) => b.ownerCount - a.ownerCount)
    .slice(0, 30);

  return NextResponse.json({ results });
}
