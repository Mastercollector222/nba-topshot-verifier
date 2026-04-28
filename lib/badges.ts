/**
 * lib/badges.ts
 * ---------------------------------------------------------------------------
 * Helpers for the achievement-badge system.
 *
 * A `badge` row in the DB has optional auto-award arrays:
 *   - auto_rule_ids: string[]  — earning ANY of these reward rule ids grants it.
 *   - auto_hunt_ids: string[]  — entering ANY of these treasure hunts grants it.
 *
 * `awardAutoBadges()` is idempotent: it's safe to call on every verify /
 * hunt entry. We only INSERT rows that don't already exist (ON CONFLICT
 * DO NOTHING semantics via ignoreDuplicates). Admin can also manually
 * grant any badge through the admin UI; manual awards set source='manual'
 * and are never overwritten by the auto path.
 *
 * All reads use the service-role client — this helper is server-only.
 * ---------------------------------------------------------------------------
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "./supabase";

export interface BadgeRow {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  autoRuleIds: string[];
  autoHuntIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserBadgeRow {
  badgeId: string;
  awardedAt: string;
  source: "auto" | "manual";
}

/** Map a raw badges row (snake_case) into our camelCase shape. */
export function mapBadgeRow(r: Record<string, unknown>): BadgeRow {
  return {
    id: String(r.id),
    name: String(r.name),
    description: (r.description as string | null) ?? null,
    imageUrl: (r.image_url as string | null) ?? null,
    autoRuleIds: Array.isArray(r.auto_rule_ids)
      ? (r.auto_rule_ids as string[])
      : [],
    autoHuntIds: Array.isArray(r.auto_hunt_ids)
      ? (r.auto_hunt_ids as string[])
      : [],
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

/**
 * Best-effort auto-awarder. Called from:
 *   - /api/verify after lifetime_completions upsert (passes ruleIds the
 *     user currently has earned)
 *   - /api/treasure-hunts/[id]/enter after a successful entry (passes
 *     the single huntId)
 *
 * Never throws — failure to award a decorative badge should not break
 * the primary flow. Errors are swallowed but logged to stderr.
 */
export async function awardAutoBadges(params: {
  address: string;
  ruleIds?: string[];
  huntIds?: string[];
  client?: SupabaseClient;
}): Promise<void> {
  const { address, ruleIds = [], huntIds = [], client } = params;
  if (ruleIds.length === 0 && huntIds.length === 0) return;
  const admin = client ?? supabaseAdmin();

  try {
    // Pull the full badges catalog once; the list is small (tens of
    // rows) and this avoids an N-query fan-out.
    const { data, error } = await admin
      .from("badges")
      .select("id, auto_rule_ids, auto_hunt_ids");
    if (error) throw error;

    const ruleSet = new Set(ruleIds);
    const huntSet = new Set(huntIds);
    const matches: string[] = [];
    for (const row of (data ?? []) as Array<{
      id: string;
      auto_rule_ids: string[] | null;
      auto_hunt_ids: string[] | null;
    }>) {
      const rs = row.auto_rule_ids ?? [];
      const hs = row.auto_hunt_ids ?? [];
      if (rs.some((id) => ruleSet.has(id)) || hs.some((id) => huntSet.has(id))) {
        matches.push(row.id);
      }
    }
    if (matches.length === 0) return;

    // Upsert each matched badge for the user. ignoreDuplicates keeps the
    // original awarded_at / source intact on re-entry.
    await admin.from("user_badges").upsert(
      matches.map((badge_id) => ({
        flow_address: address,
        badge_id,
        source: "auto" as const,
      })),
      { onConflict: "flow_address,badge_id", ignoreDuplicates: true },
    );
  } catch (e) {
    // Best-effort: never break the upstream request for a decorative badge.
    // eslint-disable-next-line no-console
    console.warn("awardAutoBadges failed:", e);
  }
}
