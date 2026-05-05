/**
 * GET /api/challenges/progress
 * ---------------------------------------------------------------------------
 * Public route — no auth required.
 * Returns completion counts for the top 5 active reward rules so the
 * homepage can show a "Live challenges" progress bar card.
 *
 * Response:
 *   {
 *     totalUsers: number,          // users with at least one verified scan
 *     challenges: [{
 *       id, reward, type,
 *       completed,                 // distinct collectors who completed it
 *       totalUsers,                // same as top-level (convenience)
 *       pctOfUsers,                // 0-100 float
 *     }]
 *   }
 *
 * Cached at the CDN edge for 60 seconds so repeated homepage loads don't
 * hammer the database on every request.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const revalidate = 60; // Next.js Route Handler cache: 60 s

export async function GET() {
  const sb = supabaseAdmin();

  // ── Fan-out the three independent reads ───────────────────────────────────
  const [rulesRes, usersRes] = await Promise.all([
    sb
      .from("reward_rules")
      .select("id, reward, type")
      .eq("enabled", true),
    sb
      .from("users")
      .select("flow_address", { count: "exact", head: true })
      .not("last_verified_at", "is", null),
  ]);

  if (rulesRes.error) {
    return NextResponse.json({ error: rulesRes.error.message }, { status: 500 });
  }
  if (usersRes.error) {
    return NextResponse.json({ error: usersRes.error.message }, { status: 500 });
  }

  const rules = (rulesRes.data ?? []) as { id: string; reward: string; type: string }[];
  const totalUsers = usersRes.count ?? 0;

  if (rules.length === 0) {
    return NextResponse.json({ totalUsers, challenges: [] });
  }

  // ── Count distinct completions per rule in parallel ────────────────────────
  const counts = await Promise.all(
    rules.map((r) =>
      sb
        .from("lifetime_completions")
        .select("flow_address", { count: "exact", head: true })
        .eq("rule_id", r.id)
        .then(({ count }) => ({ id: r.id, completed: count ?? 0 })),
    ),
  );

  const countById = new Map(counts.map((c) => [c.id, c.completed]));

  // ── Sort by completion count desc, take top 5 ─────────────────────────────
  const challenges = rules
    .map((r) => {
      const completed = countById.get(r.id) ?? 0;
      return {
        id: r.id,
        reward: r.reward,
        type: r.type,
        completed,
        totalUsers,
        pctOfUsers: totalUsers > 0 ? Math.round((completed / totalUsers) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 5);

  return NextResponse.json(
    { totalUsers, challenges },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
