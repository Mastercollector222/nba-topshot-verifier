/**
 * GET /api/follows/list?address=0x…&type=followers|following
 * ---------------------------------------------------------------------------
 * Returns the list of users who follow `address` (type=followers), or the
 * list of users that `address` follows (type=following). Each entry includes
 * the address, optional topshot_username, and optional avatar_url.
 *
 * Public: no authentication required — counts are already public.
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function normalizeAddress(v: string | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return /^0x[0-9a-f]{16}$/.test(t) ? t : null;
}

export async function GET(req: NextRequest) {
  const target = normalizeAddress(req.nextUrl.searchParams.get("address"));
  const type = req.nextUrl.searchParams.get("type");

  if (!target) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (type !== "followers" && type !== "following") {
    return NextResponse.json({ error: "type must be followers|following" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // followers => rows where followee_address = target, list each follower
  // following => rows where follower_address = target, list each followee
  const filterCol = type === "followers" ? "followee_address" : "follower_address";
  const projectCol = type === "followers" ? "follower_address" : "followee_address";

  const { data: edges, error: edgeErr } = await sb
    .from("follows")
    .select(`${projectCol}, created_at`)
    .eq(filterCol, target)
    .order("created_at", { ascending: false })
    .limit(500);

  if (edgeErr) {
    return NextResponse.json({ error: edgeErr.message }, { status: 500 });
  }

  const addresses = (edges ?? [])
    .map((r) => (r as Record<string, unknown>)[projectCol] as string)
    .filter(Boolean);

  if (addresses.length === 0) {
    return NextResponse.json({ users: [] });
  }

  const { data: users, error: usersErr } = await sb
    .from("users")
    .select("flow_address, topshot_username, avatar_url")
    .in("flow_address", addresses);

  if (usersErr) {
    return NextResponse.json({ error: usersErr.message }, { status: 500 });
  }

  // Preserve the follow-order (most recent first) by mapping addresses → user rows
  const byAddr = new Map<string, { topshot_username: string | null; avatar_url: string | null }>();
  for (const u of users ?? []) {
    byAddr.set(u.flow_address as string, {
      topshot_username: (u.topshot_username as string | null) ?? null,
      avatar_url: (u.avatar_url as string | null) ?? null,
    });
  }

  const result = addresses.map((addr) => {
    const u = byAddr.get(addr);
    return {
      address: addr,
      username: u?.topshot_username ?? null,
      avatarUrl: u?.avatar_url ?? null,
    };
  });

  return NextResponse.json({ users: result });
}
