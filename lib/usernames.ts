/**
 * lib/usernames.ts
 * ---------------------------------------------------------------------------
 * Shared resolver: Flow address → display username.
 *
 * Two sources, in priority order:
 *   1. `users.topshot_username` — server-VERIFIED via Top Shot's GraphQL
 *      (the user proved the username is theirs by linking it from a
 *      session bound to that wallet). This is the source of truth.
 *   2. `reward_claims.topshot_username` — self-reported on a reward claim
 *      form. Unverified, but historical (predates the verified flow) so
 *      we fall back to it for users who never linked but did claim.
 *
 * Used by:
 *   - `/api/leaderboard`            (Challenges)
 *   - `/api/leaderboard/tsr`        (TSR Points)
 *   - `/api/admin/tsr`              (admin TSR console)
 *
 * Pages through Supabase's default 1000-row cap so large tables work.
 * ---------------------------------------------------------------------------
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE = 1000;

interface UserRow {
  flow_address: string;
  topshot_username: string | null;
}

interface ClaimRow {
  flow_address: string;
  topshot_username: string | null;
  updated_at: string;
}

/**
 * Build a map of `flow_address → username`, with verified entries
 * winning over unverified claim submissions. Returns an empty map on
 * any DB error rather than throwing — usernames are decorative on the
 * leaderboard, never load-bearing.
 */
export async function buildUsernameMap(
  client: SupabaseClient,
): Promise<Map<string, string>> {
  // 1) Verified usernames from `users.topshot_username` — these win.
  const verified = new Map<string, string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("users")
      .select("flow_address, topshot_username")
      .not("topshot_username", "is", null)
      .range(from, from + PAGE - 1);
    if (error) break;
    if (!data || data.length === 0) break;
    for (const r of data as UserRow[]) {
      if (r.topshot_username) verified.set(r.flow_address, r.topshot_username);
    }
    if (data.length < PAGE) break;
  }

  // 2) Fallback from `reward_claims.topshot_username` for any address
  //    that doesn't already have a verified entry. Pick the most
  //    recently updated claim if the user filed multiple.
  const claimByAddr = new Map<string, { name: string; updatedAt: string }>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("reward_claims")
      .select("flow_address, topshot_username, updated_at")
      .range(from, from + PAGE - 1);
    if (error) break;
    if (!data || data.length === 0) break;
    for (const c of data as ClaimRow[]) {
      if (!c.topshot_username) continue;
      const cur = claimByAddr.get(c.flow_address);
      if (!cur || c.updated_at > cur.updatedAt) {
        claimByAddr.set(c.flow_address, {
          name: c.topshot_username,
          updatedAt: c.updated_at,
        });
      }
    }
    if (data.length < PAGE) break;
  }

  // Merge: verified wins, fall back to claim-derived.
  const out = new Map<string, string>(verified);
  for (const [addr, { name }] of claimByAddr) {
    if (!out.has(addr)) out.set(addr, name);
  }
  return out;
}
