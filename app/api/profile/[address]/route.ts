/**
 * GET /api/profile/[address]
 * ---------------------------------------------------------------------------
 * Public profile aggregate for a Flow address. Returns:
 *   - username (Top Shot username, if set)
 *   - challengesCompleted (count from lifetime_completions)
 *   - tsr balance (lifetime + adjustments)
 *   - badges (joined catalog rows)
 *   - lastVerifiedAt
 *
 * Public-readable: no auth required. The data exposed is the same
 * leaderboards already publish (address + username + counts/points)
 * plus badges, which RLS allows anyone to read.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { mapBadgeRow } from "@/lib/badges";
import { supabaseAdmin } from "@/lib/supabase";
import { getAllTsrBalances, getUserTsr } from "@/lib/tsr";

function normalizeAddress(v: string): string | null {
  const t = v.trim().toLowerCase();
  return /^0x[0-9a-f]{16}$/.test(t) ? t : null;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ address: string }> },
) {
  const { address: raw } = await context.params;
  const address = normalizeAddress(raw);
  if (!address) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Fan-out the independent reads. None depend on each other.
  const [userRes, completionsRes, badgesRes, tsr, allBalances] = await Promise.all([
    sb
      .from("users")
      .select("topshot_username, last_verified_at, created_at, bio, avatar_url")
      .eq("flow_address", address)
      .maybeSingle(),
    sb
      .from("lifetime_completions")
      .select("rule_id, reward, tsr_points, first_earned_at")
      .eq("flow_address", address)
      .order("first_earned_at", { ascending: false }),
    sb
      .from("user_badges")
      .select(
        "badge_id, awarded_at, source, badges (id, name, description, image_url, auto_rule_ids, auto_hunt_ids, created_at, updated_at)",
      )
      .eq("flow_address", address)
      .order("awarded_at", { ascending: false }),
    getUserTsr(address, sb),
    getAllTsrBalances(sb),
  ]);

  // Rank = how many users have a strictly higher total TSR, plus 1.
  // null when this user has 0 TSR (not yet on the board).
  const tsrTotal = tsr.total;
  const tsrRank =
    tsrTotal > 0
      ? allBalances.filter((b) => b.total > tsrTotal).length + 1
      : null;

  const completions = (completionsRes.data ?? []) as Array<{
    rule_id: string;
    reward: string;
    tsr_points: number;
    first_earned_at: string;
  }>;

  // Supabase returns the joined `badges` row inline. supabase-js types it
  // as an array on FK joins, so we route through `unknown` and normalize
  // to either object or first-of-array.
  const badges = ((badgesRes.data ?? []) as unknown as Array<{
    badge_id: string;
    awarded_at: string;
    source: "auto" | "manual";
    badges: Record<string, unknown> | Array<Record<string, unknown>> | null;
  }>)
    .map((r) => {
      const inner = Array.isArray(r.badges) ? r.badges[0] : r.badges;
      if (!inner) return null;
      return {
        ...mapBadgeRow(inner),
        awardedAt: r.awarded_at,
        source: r.source,
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  return NextResponse.json({
    address,
    username: userRes.data?.topshot_username ?? null,
    bio: (userRes.data as { bio?: string | null } | null)?.bio ?? null,
    avatarUrl: (userRes.data as { avatar_url?: string | null } | null)?.avatar_url ?? null,
    createdAt: userRes.data?.created_at ?? null,
    lastVerifiedAt: userRes.data?.last_verified_at ?? null,
    challengesCompleted: completions.length,
    tsr,
    tsrRank,
    completions: completions.map((c) => ({
      ruleId: c.rule_id,
      reward: c.reward,
      tsrPoints: c.tsr_points,
      firstEarnedAt: c.first_earned_at,
    })),
    badges,
  });
}
