/**
 * /api/feed/following
 * ---------------------------------------------------------------------------
 * Personalized timeline: completions + milestone claims by users the
 * signed-in caller follows. Empty list (not 401) when not signed in or
 * not following anyone, so the UI can degrade gracefully.
 *
 * Each item carries a `type` discriminator so the client can render
 * different row layouts (challenge vs. milestone).
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

interface CompletionRow {
  flow_address: string;
  rule_id: string;
  reward: string;
  tsr_points: number;
  first_earned_at: string;
}

interface MilestoneClaimRow {
  id: string;
  flow_address: string;
  milestone_id: string;
  claimed_at: string;
  tsr_milestones: { threshold: number; reward_label: string; bonus_tsr: number } | null;
}

interface UserRow {
  flow_address: string;
  topshot_username: string | null;
  avatar_url: string | null;
}

export type FeedItem =
  | {
      type: "challenge";
      flowAddress: string;
      username: string | null;
      avatarUrl: string | null;
      ruleId: string;
      reward: string;
      tsrPoints: number;
      earnedAt: string;
    }
  | {
      type: "milestone";
      flowAddress: string;
      username: string | null;
      avatarUrl: string | null;
      milestoneId: string;
      threshold: number;
      rewardLabel: string;
      bonusTsr: number;
      earnedAt: string;
    };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "25", 10)));

  const viewer = await getSessionAddress();
  if (!viewer) {
    return NextResponse.json({ items: [], following: 0, viewer: null });
  }

  const sb = supabaseAdmin();

  // 1) Resolve who the viewer follows.
  const { data: followsRaw } = await sb
    .from("follows")
    .select("followee_address")
    .eq("follower_address", viewer);
  const followees = ((followsRaw ?? []) as Array<{ followee_address: string }>).map(
    (r) => r.followee_address,
  );

  if (followees.length === 0) {
    return NextResponse.json({ items: [], following: 0, viewer });
  }

  // 2) Pull recent challenge completions + milestone claims in parallel,
  //    then merge / sort by timestamp on the server.
  const [completionsRes, milestonesRes, usersRes] = await Promise.all([
    sb
      .from("lifetime_completions")
      .select("flow_address, rule_id, reward, tsr_points, first_earned_at")
      .in("flow_address", followees)
      .order("first_earned_at", { ascending: false })
      .limit(limit),
    sb
      .from("tsr_milestone_claims")
      .select(
        "id, flow_address, milestone_id, claimed_at, tsr_milestones(threshold, reward_label, bonus_tsr)",
      )
      .in("flow_address", followees)
      .order("claimed_at", { ascending: false })
      .limit(limit),
    sb
      .from("users")
      .select("flow_address, topshot_username, avatar_url")
      .in("flow_address", followees),
  ]);

  const userMap = new Map<string, { username: string | null; avatarUrl: string | null }>();
  for (const u of (usersRes.data ?? []) as UserRow[]) {
    userMap.set(u.flow_address, {
      username: u.topshot_username,
      avatarUrl: u.avatar_url,
    });
  }
  const decorate = (addr: string) => ({
    username: userMap.get(addr)?.username ?? null,
    avatarUrl: userMap.get(addr)?.avatarUrl ?? null,
  });

  const completions: FeedItem[] = ((completionsRes.data ?? []) as CompletionRow[]).map(
    (r) => ({
      type: "challenge",
      flowAddress: r.flow_address,
      ...decorate(r.flow_address),
      ruleId: r.rule_id,
      reward: r.reward,
      tsrPoints: r.tsr_points,
      earnedAt: r.first_earned_at,
    }),
  );

  // Supabase typings turn FK joins into arrays; normalize.
  const milestones: FeedItem[] = (
    (milestonesRes.data ?? []) as unknown as Array<
      Omit<MilestoneClaimRow, "tsr_milestones"> & {
        tsr_milestones:
          | { threshold: number; reward_label: string; bonus_tsr: number }
          | Array<{ threshold: number; reward_label: string; bonus_tsr: number }>
          | null;
      }
    >
  )
    .map((r) => {
      const ms = Array.isArray(r.tsr_milestones)
        ? r.tsr_milestones[0]
        : r.tsr_milestones;
      if (!ms) return null;
      return {
        type: "milestone" as const,
        flowAddress: r.flow_address,
        ...decorate(r.flow_address),
        milestoneId: r.milestone_id,
        threshold: ms.threshold,
        rewardLabel: ms.reward_label,
        bonusTsr: ms.bonus_tsr,
        earnedAt: r.claimed_at,
      };
    })
    .filter((x): x is Extract<FeedItem, { type: "milestone" }> => x !== null);

  const merged = [...completions, ...milestones]
    .sort((a, b) => (a.earnedAt < b.earnedAt ? 1 : -1))
    .slice(0, limit);

  return NextResponse.json({ items: merged, following: followees.length, viewer });
}
