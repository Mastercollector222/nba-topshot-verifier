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
import { buildUsernameMap } from "@/lib/usernames";

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
  // Verified usernames from `users.topshot_username` win over the
  // unverified `reward_claims.topshot_username` fallback.
  const usernameByAddr = await buildUsernameMap(admin);

  // Pull EVERY connected wallet (not just those with TSR activity) so
  // the admin can see the full audience and which ones have linked a
  // Top Shot username. Joined with TSR balances + last-verified time.
  const balanceByAddr = new Map(balances.map((b) => [b.address, b]));
  const allUsers: Array<{
    flow_address: string;
    last_verified_at: string | null;
    topshot_username: string | null;
    topshot_username_set_at: string | null;
  }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("users")
      .select(
        "flow_address, last_verified_at, topshot_username, topshot_username_set_at",
      )
      .range(from, from + 999);
    if (error) break;
    if (!data || data.length === 0) break;
    allUsers.push(...(data as typeof allUsers));
    if (data.length < 1000) break;
  }

  const entries = allUsers
    .map((u) => {
      const bal = balanceByAddr.get(u.flow_address);
      // Username priority: verified column on `users` first, fallback
      // to claim-derived map (covers users who never linked but did
      // submit a claim historically).
      const username =
        u.topshot_username ?? usernameByAddr.get(u.flow_address) ?? null;
      return {
        address: u.flow_address,
        username,
        usernameVerified: Boolean(u.topshot_username),
        usernameSetAt: u.topshot_username_set_at,
        lastVerifiedAt: u.last_verified_at,
        fromChallenges: bal?.fromChallenges ?? 0,
        fromAdjustments: bal?.fromAdjustments ?? 0,
        total: bal?.total ?? 0,
      };
    })
    // Sort by TSR desc, then alphabetically by username/address so the
    // ordering is deterministic for users with 0 TSR.
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      const an = (a.username ?? a.address).toLowerCase();
      const bn = (b.username ?? b.address).toLowerCase();
      return an.localeCompare(bn);
    });

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
