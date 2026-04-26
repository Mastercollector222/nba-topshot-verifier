/**
 * lib/tsr.ts
 * ---------------------------------------------------------------------------
 * Server-side helpers for the TSR (Top Shot Rewards) points system.
 *
 * A user's TSR balance has two ledgers:
 *   1. `lifetime_completions.tsr_points` — points awarded automatically
 *      the first time they complete a reward rule. The value is snapshotted
 *      from the rule at earn time so retroactive edits never change history.
 *   2. `tsr_adjustments.points` — manual admin grants/revokes (positive or
 *      negative integers, append-only audit ledger).
 *
 *   total = sum(lifetime_completions.tsr_points) + sum(tsr_adjustments.points)
 *
 * All reads here use the service-role client so they bypass RLS — callers
 * are expected to have already authenticated the requester upstream.
 * ---------------------------------------------------------------------------
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "./supabase";

export interface TsrBalance {
  total: number;
  /** Points earned by completing reward rules. */
  fromChallenges: number;
  /** Net of all admin adjustments (can be negative). */
  fromAdjustments: number;
}

const PAGE = 1000;

/** Fetch the TSR balance for a single user. */
export async function getUserTsr(
  address: string,
  client?: SupabaseClient,
): Promise<TsrBalance> {
  const admin = client ?? supabaseAdmin();

  // Two independent reads — kick them off in parallel.
  const [completions, adjustments] = await Promise.all([
    admin
      .from("lifetime_completions")
      .select("tsr_points")
      .eq("flow_address", address),
    admin
      .from("tsr_adjustments")
      .select("points")
      .eq("flow_address", address),
  ]);

  const fromChallenges = (
    (completions.data as Array<{ tsr_points: number | null }> | null) ?? []
  ).reduce((s, r) => s + (r.tsr_points ?? 0), 0);

  const fromAdjustments = (
    (adjustments.data as Array<{ points: number | null }> | null) ?? []
  ).reduce((s, r) => s + (r.points ?? 0), 0);

  return {
    total: fromChallenges + fromAdjustments,
    fromChallenges,
    fromAdjustments,
  };
}

/**
 * Aggregate TSR balances for every address that has any TSR activity
 * (either a completion or an adjustment). Used by:
 *   - `/api/leaderboard/tsr` — public ranking
 *   - `/api/admin/tsr`       — admin overview screen
 *
 * Pages through Supabase's 1000-row default cap; with thousands of users
 * this is still fast (single SUM in JS).
 */
export interface TsrAggregateRow {
  address: string;
  fromChallenges: number;
  fromAdjustments: number;
  total: number;
}

export async function getAllTsrBalances(
  client?: SupabaseClient,
): Promise<TsrAggregateRow[]> {
  const admin = client ?? supabaseAdmin();
  const acc = new Map<string, { fromChallenges: number; fromAdjustments: number }>();
  const ensure = (addr: string) => {
    let row = acc.get(addr);
    if (!row) {
      row = { fromChallenges: 0, fromAdjustments: 0 };
      acc.set(addr, row);
    }
    return row;
  };

  // 1) Earned points across the whole `lifetime_completions` table.
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("lifetime_completions")
      .select("flow_address, tsr_points")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`tsr: completions read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data as Array<{ flow_address: string; tsr_points: number | null }>) {
      ensure(r.flow_address).fromChallenges += r.tsr_points ?? 0;
    }
    if (data.length < PAGE) break;
  }

  // 2) Manual admin adjustments.
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("tsr_adjustments")
      .select("flow_address, points")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`tsr: adjustments read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data as Array<{ flow_address: string; points: number | null }>) {
      ensure(r.flow_address).fromAdjustments += r.points ?? 0;
    }
    if (data.length < PAGE) break;
  }

  return [...acc.entries()].map(([address, v]) => ({
    address,
    fromChallenges: v.fromChallenges,
    fromAdjustments: v.fromAdjustments,
    total: v.fromChallenges + v.fromAdjustments,
  }));
}
