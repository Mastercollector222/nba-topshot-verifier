/**
 * /api/admin/forge/sold-moments/import
 * ---------------------------------------------------------------------------
 * Bulk-populate the sold-moments allowlist straight from a wallet's verified
 * collection snapshot (public.owned_moments), so an operator can add "all of a
 * moment" (a set+play) or "all of a set" they own with one click instead of
 * pasting raw IDs.
 *
 *   GET  ?address=0x… → the collection grouped by (set_id, play_id) with a
 *          count + how many are already on the sold list. Lets the admin pick
 *          which moment(s) / set(s) to import.
 *   POST  { address, setId?, playId?, note? } → adds every owned moment_id
 *          matching the filter to sold_moments. Omit playId to add a whole set;
 *          omit both to add the entire collection.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { logAdminAction } from "@/lib/adminAudit";

const ADDR_RE = /^0x[0-9a-f]{16}$/;

function normAddr(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  return ADDR_RE.test(s) ? s : null;
}

interface OwnedRow {
  moment_id: string;
  set_id: number;
  play_id: number;
  set_name: string | null;
  series: number | null;
  play_metadata: Record<string, string> | null;
}

/** Page through every owned_moments row for an address (optionally filtered). */
async function loadOwnedRows(
  sb: ReturnType<typeof supabaseAdmin>,
  address: string,
  setId?: number | null,
  playId?: number | null,
): Promise<OwnedRow[]> {
  const PAGE = 1000;
  const out: OwnedRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = sb
      .from("owned_moments")
      .select("moment_id, set_id, play_id, set_name, series, play_metadata")
      .eq("flow_address", address)
      .range(from, from + PAGE - 1);
    if (setId != null) query = query.eq("set_id", setId);
    if (playId != null) query = query.eq("play_id", playId);

    const { data, error } = await query;
    if (error) throw new Error(`owned_moments read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as OwnedRow[]));
    if (data.length < PAGE) break;
  }
  return out;
}

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const address = normAddr(url.searchParams.get("address"));
  if (!address) {
    return NextResponse.json(
      { error: "Provide a valid Flow address (0x + 16 hex chars)" },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();
  const rows = await loadOwnedRows(sb, address);

  if (rows.length === 0) {
    return NextResponse.json({ address, total: 0, groups: [] });
  }

  // Which of these moment_ids are already on the sold list?
  const allIds = rows.map((r) => String(r.moment_id));
  const onList = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < allIds.length; i += CHUNK) {
    const slice = allIds.slice(i, i + CHUNK);
    const { data, error } = await sb
      .from("sold_moments")
      .select("moment_id")
      .in("moment_id", slice);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const r of (data ?? []) as Array<{ moment_id: string }>) {
      onList.add(String(r.moment_id));
    }
  }

  // Group by (set_id, play_id).
  const groups = new Map<
    string,
    {
      setId: number;
      playId: number;
      setName: string | null;
      playerName: string | null;
      series: number | null;
      count: number;
      alreadyOnList: number;
    }
  >();
  for (const r of rows) {
    const key = `${r.set_id}/${r.play_id}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        setId: Number(r.set_id),
        playId: Number(r.play_id),
        setName: r.set_name ?? null,
        playerName: r.play_metadata?.PlayerName ?? null,
        series: r.series == null ? null : Number(r.series),
        count: 0,
        alreadyOnList: 0,
      };
      groups.set(key, g);
    }
    g.count += 1;
    if (onList.has(String(r.moment_id))) g.alreadyOnList += 1;
  }

  const list = [...groups.values()].sort(
    (a, b) =>
      (a.setName ?? "").localeCompare(b.setName ?? "") ||
      (a.playerName ?? "").localeCompare(b.playerName ?? "") ||
      a.playId - b.playId,
  );

  return NextResponse.json({ address, total: rows.length, groups: list });
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: { address?: unknown; setId?: unknown; playId?: unknown; note?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = normAddr(body.address);
  if (!address) {
    return NextResponse.json(
      { error: "Provide a valid Flow address (0x + 16 hex chars)" },
      { status: 400 },
    );
  }

  const setId =
    body.setId == null || body.setId === "" ? null : Number(body.setId);
  const playId =
    body.playId == null || body.playId === "" ? null : Number(body.playId);
  if (setId != null && !Number.isFinite(setId)) {
    return NextResponse.json({ error: "Invalid setId" }, { status: 400 });
  }
  if (playId != null && !Number.isFinite(playId)) {
    return NextResponse.json({ error: "Invalid playId" }, { status: 400 });
  }

  const note =
    typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  const sb = supabaseAdmin();
  const rows = await loadOwnedRows(sb, address, setId, playId);
  const ids = [...new Set(rows.map((r) => String(r.moment_id)))];

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "No matching moments found in that collection snapshot" },
      { status: 400 },
    );
  }

  const toInsert = ids.map((moment_id) => ({
    moment_id,
    note,
    added_by: gate.address,
  }));

  const { error } = await sb
    .from("sold_moments")
    .upsert(toInsert, { onConflict: "moment_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void logAdminAction({
    actor: gate.address,
    action: "forge_sold_moments.import",
    targetType: "sold_moments",
    targetId: `${ids.length} ids`,
    after: { address, setId, playId, note, count: ids.length } as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, added: ids.length });
}
