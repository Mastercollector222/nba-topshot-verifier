/**
 * /api/feed/recent
 * ---------------------------------------------------------------------------
 * Public, paginated stream of "Hall of Fame" completions for the
 * Recently Earned live feed. Reads from `lifetime_completions` (append-only,
 * never rewritten) and decorates each row with the owner's Top Shot
 * username + avatar. Cached briefly so we don't hammer the DB even when
 * dozens of clients poll concurrently.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const revalidate = 30;

interface Row {
  flow_address: string;
  rule_id: string;
  reward: string;
  tsr_points: number;
  first_earned_at: string;
}

interface UserRow {
  flow_address: string;
  topshot_username: string | null;
  avatar_url: string | null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));

  const sb = supabaseAdmin();

  // 1) Most recent completions across all users.
  const { data: rowsRaw, error } = await sb
    .from("lifetime_completions")
    .select("flow_address, rule_id, reward, tsr_points, first_earned_at")
    .order("first_earned_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (rowsRaw ?? []) as Row[];

  // 2) Hydrate user display info for the addresses we just pulled.
  const addrs = Array.from(new Set(rows.map((r) => r.flow_address)));
  const userMap = new Map<string, { username: string | null; avatarUrl: string | null }>();
  if (addrs.length > 0) {
    const { data: users } = await sb
      .from("users")
      .select("flow_address, topshot_username, avatar_url")
      .in("flow_address", addrs);
    for (const u of (users ?? []) as UserRow[]) {
      userMap.set(u.flow_address, {
        username: u.topshot_username,
        avatarUrl: u.avatar_url,
      });
    }
  }

  const items = rows.map((r) => {
    const u = userMap.get(r.flow_address);
    return {
      flowAddress: r.flow_address,
      username: u?.username ?? null,
      avatarUrl: u?.avatarUrl ?? null,
      ruleId: r.rule_id,
      reward: r.reward,
      tsrPoints: r.tsr_points,
      earnedAt: r.first_earned_at,
    };
  });

  return NextResponse.json(
    { items },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
