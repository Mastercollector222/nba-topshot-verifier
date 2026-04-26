/**
 * /api/admin/tsr
 * ---------------------------------------------------------------------------
 *   GET   → list every user with TSR activity, with breakdown:
 *           { entries: [{ address, username, fromChallenges, fromAdjustments, total }] }
 *   POST  → record a new TSR adjustment for a user.
 *           Body: { flowAddress: "0x…", points: number, reason?: string }
 *           - `points` is a signed integer (negative subtracts).
 *           - Append-only: we never overwrite or delete prior rows;
 *             corrections are made by inserting an opposite-signed row.
 *
 * Admin-only — gated by `requireAdmin()`.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { getAllTsrBalances } from "@/lib/tsr";

interface ClaimRow {
  flow_address: string;
  topshot_username: string;
  updated_at: string;
}

const PAGE = 1000;

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const admin = supabaseAdmin();

  let balances;
  try {
    balances = await getAllTsrBalances(admin);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "TSR aggregate failed" },
      { status: 500 },
    );
  }

  // Decorate with Top Shot username (if any) the admin can recognize.
  const claimRows: ClaimRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("reward_claims")
      .select("flow_address, topshot_username, updated_at")
      .range(from, from + PAGE - 1);
    if (error) break;
    if (!data || data.length === 0) break;
    claimRows.push(...(data as ClaimRow[]));
    if (data.length < PAGE) break;
  }
  const usernameByAddr = new Map<string, { name: string; updatedAt: string }>();
  for (const c of claimRows) {
    if (!c.topshot_username) continue;
    const cur = usernameByAddr.get(c.flow_address);
    if (!cur || c.updated_at > cur.updatedAt) {
      usernameByAddr.set(c.flow_address, {
        name: c.topshot_username,
        updatedAt: c.updated_at,
      });
    }
  }

  const entries = balances
    .sort((a, b) => b.total - a.total)
    .map((b) => ({
      address: b.address,
      username: usernameByAddr.get(b.address)?.name ?? null,
      fromChallenges: b.fromChallenges,
      fromAdjustments: b.fromAdjustments,
      total: b.total,
    }));

  return NextResponse.json({ entries });
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
    flowAddress?: unknown;
    points?: unknown;
    reason?: unknown;
  };

  // Server-side validation. Address shape mirrors the column check
  // constraint so a typo gets rejected here with a friendlier message
  // than Postgres would return.
  const address =
    typeof b.flowAddress === "string" ? b.flowAddress.trim().toLowerCase() : "";
  if (!/^0x[0-9a-f]{16}$/.test(address)) {
    return NextResponse.json(
      { error: "flowAddress must be a 0x-prefixed 16-hex-char Flow address" },
      { status: 400 },
    );
  }
  if (
    typeof b.points !== "number" ||
    !Number.isFinite(b.points) ||
    !Number.isInteger(b.points) ||
    b.points === 0
  ) {
    return NextResponse.json(
      { error: "points must be a non-zero integer" },
      { status: 400 },
    );
  }
  const reason =
    typeof b.reason === "string" && b.reason.trim().length > 0
      ? b.reason.trim().slice(0, 500)
      : null;

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("tsr_adjustments")
    .insert({
      flow_address: address,
      points: b.points,
      reason,
      created_by: gate.address,
    })
    .select("id, flow_address, points, reason, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, adjustment: data });
}
