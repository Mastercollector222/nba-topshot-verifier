/**
 * POST /api/verify
 * ---------------------------------------------------------------------------
 * Authenticated endpoint. Refreshes a user's Top Shot ownership snapshot
 * and evaluates every reward rule.
 *
 * Auth: reads `sb-access` cookie → verifies our custom JWT → `sub` is the
 * authoritative Flow address. The client CANNOT override which address we
 * scan; we ignore any body-supplied address.
 *
 * Flow:
 *   1. `getAllMomentsForParent(address)` — mainnet aggregator (parent + all
 *      Hybrid Custody children) via lib/topshot.ts → lib/flow.ts.
 *   2. Load `config/rewards.json`, validate with `parseRewardsConfig`.
 *   3. `verify(moments, rules)` — pure rules engine (lib/verify.ts).
 *   4. Persist a fresh snapshot:
 *        - upsert rows into `reward_rules` so FKs resolve
 *        - replace `owned_moments` rows for this address
 *        - replace `earned_rewards` rows for this address
 *        - bump `users.last_verified_at`
 *   5. Return `{ address, moments, evaluations, earnedRewards }`.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, verifyFlowSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { getAllMomentsForParent, type OwnedMoment } from "@/lib/topshot";
import {
  verify,
  parseRewardsConfig,
  validateSingleRule,
  challengeMomentIds,
  nearMissMomentIds,
  type RewardRule,
} from "@/lib/verify";
import rewardsJson from "@/config/rewards.json";

/**
 * GET /api/verify
 * ---------------------------------------------------------------------------
 * Fast read-only path: returns the user's *cached* snapshot from the DB
 * without hitting Flow mainnet. Evaluates the currently-enabled rules
 * against that snapshot so the dashboard renders instantly on load.
 *
 * Returns 204 No Content if the user has never run a verification.
 * ---------------------------------------------------------------------------
 */
export async function GET() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const claims = await verifyFlowSession(token);
  if (!claims?.sub) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
  const address = claims.sub;
  const admin = supabaseAdmin();

  // Paginate past Supabase's 1000-row default cap so large collections
  // (10k+) are fully loaded.
  const PAGE = 1000;
  const rows: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("owned_moments")
      .select(
        "moment_id, set_id, play_id, series, serial_number, source_address, set_name, play_metadata, thumbnail, is_locked, lock_expiry",
      )
      .eq("flow_address", address)
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as Array<Record<string, unknown>>));
    if (data.length < PAGE) break;
  }

  if (rows.length === 0) {
    // Nothing cached: tell the client to kick off a fresh scan.
    return new NextResponse(null, { status: 204 });
  }

  const moments: OwnedMoment[] = rows.map((row) => ({
    source: row.source_address as string,
    momentID: String(row.moment_id),
    playID: Number(row.play_id),
    setID: Number(row.set_id),
    serialNumber: Number(row.serial_number),
    setName: (row.set_name as string | null) ?? null,
    series: row.series == null ? null : Number(row.series),
    playMetadata:
      (row.play_metadata as Record<string, string> | null) ?? null,
    thumbnail: (row.thumbnail as string | null) ?? null,
    isLocked: Boolean(row.is_locked),
    lockExpiry: row.lock_expiry == null ? null : Number(row.lock_expiry),
  }));

  // Re-evaluate rules fresh against the snapshot so admin rule changes
  // are reflected without requiring a full rescan.
  let rules: RewardRule[] = [];
  const { data: dbRules } = await admin
    .from("reward_rules")
    .select("payload")
    .eq("enabled", true);
  if (dbRules && dbRules.length > 0) {
    try {
      rules = dbRules.map((r) =>
        validateSingleRule((r as { payload: unknown }).payload),
      );
    } catch {
      /* fall back to config */
    }
  }
  if (rules.length === 0) {
    try {
      rules = parseRewardsConfig(rewardsJson).rules;
    } catch {
      rules = [];
    }
  }

  const result = verify(moments, rules);
  const challengeIds = [...challengeMomentIds(moments, rules)];
  const nearMissIds = [...nearMissMomentIds(moments, rules)];

  // Fetch last-verified timestamp for the UI "last scanned" hint.
  const { data: userRow } = await admin
    .from("users")
    .select("last_verified_at")
    .eq("flow_address", address)
    .maybeSingle();

  return NextResponse.json({
    address,
    moments,
    evaluations: result.evaluations,
    earnedRewards: result.earnedRewards,
    challengeMomentIds: challengeIds,
    nearMissMomentIds: nearMissIds,
    cached: true,
    lastVerifiedAt:
      (userRow as { last_verified_at: string } | null)?.last_verified_at ?? null,
  });
}

export async function POST(req: Request) {
  // --- 0. Parse optional scan knobs from query string:
  //         ?limit=N          → cap total Moments to scan (default: unlimited)
  //         ?chunkSize=N      → Moments per Cadence call (default: 50)
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const chunkParam = url.searchParams.get("chunkSize");
  const limit = limitParam ? Math.max(1, Number(limitParam)) : undefined;
  const chunkSize = chunkParam ? Math.max(1, Number(chunkParam)) : undefined;

  // --- 1. Authenticate.
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const claims = await verifyFlowSession(token);
  if (!claims?.sub) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
  const address = claims.sub;

  // --- 2. Load rules.
  //   Preferred source: `reward_rules` table (admin-managed, enabled=true).
  //   Fallback: `config/rewards.json` — used when the admin hasn't seeded
  //   the DB yet, so a fresh Supabase project still yields useful output.
  let rules: RewardRule[] = [];
  const adminClient = supabaseAdmin();
  const { data: dbRules } = await adminClient
    .from("reward_rules")
    .select("payload")
    .eq("enabled", true);

  if (dbRules && dbRules.length > 0) {
    try {
      rules = dbRules.map((row) =>
        validateSingleRule((row as { payload: unknown }).payload),
      );
    } catch (e) {
      return NextResponse.json(
        {
          error: `Invalid rule in DB: ${
            e instanceof Error ? e.message : String(e)
          }`,
        },
        { status: 500 },
      );
    }
  } else {
    try {
      rules = parseRewardsConfig(rewardsJson).rules;
    } catch (e) {
      return NextResponse.json(
        {
          error: `Invalid rewards config: ${
            e instanceof Error ? e.message : String(e)
          }`,
        },
        { status: 500 },
      );
    }
  }

  // --- 3. Query chain.
  let moments: OwnedMoment[];
  try {
    moments = await getAllMomentsForParent(address, { limit, chunkSize });
  } catch (e) {
    return NextResponse.json(
      {
        error: `Chain query failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      },
      { status: 502 },
    );
  }

  // --- 4. Evaluate rules.
  const result = verify(moments, rules);

  // --- 5. Persist snapshot (service role, bypasses RLS).
  const admin = adminClient;

  // 5a. Mirror rules into DB so earned_rewards FK resolves. (Idempotent —
  // admin may have seeded them already.)
  const rulesRows = rules.map((r) => ({
    id: r.id,
    type: r.type,
    reward: r.reward,
    payload: r,
    enabled: true,
    updated_at: new Date().toISOString(),
  }));
  if (rulesRows.length > 0) {
    await admin.from("reward_rules").upsert(rulesRows, { onConflict: "id" });
  }

  // 5b. Replace owned_moments for this address.
  await admin.from("owned_moments").delete().eq("flow_address", address);
  if (moments.length > 0) {
    const momentRows = moments.map((m) => ({
      flow_address: address,
      moment_id: m.momentID,
      set_id: m.setID,
      play_id: m.playID,
      series: m.series,
      serial_number: m.serialNumber,
      source_address: m.source,
      set_name: m.setName,
      play_metadata: m.playMetadata,
      thumbnail: m.thumbnail,
      is_locked: m.isLocked,
      lock_expiry: m.lockExpiry,
    }));
    // Supabase has a per-request payload cap; chunk if needed.
    const CHUNK = 500;
    for (let i = 0; i < momentRows.length; i += CHUNK) {
      const slice = momentRows.slice(i, i + CHUNK);
      const { error } = await admin.from("owned_moments").insert(slice);
      if (error) {
        return NextResponse.json(
          { error: `Snapshot write failed: ${error.message}` },
          { status: 500 },
        );
      }
    }
  }

  // 5c. Replace earned_rewards for this address. This table reflects
  // CURRENT qualifying status; rows disappear if the user no longer
  // qualifies (e.g. unlocked / sold a Moment). Used by the dashboard
  // for "you currently qualify for X rewards".
  await admin.from("earned_rewards").delete().eq("flow_address", address);
  const earnedRows = result.evaluations
    .filter((e) => e.earned)
    .map((e) => ({
      flow_address: address,
      rule_id: e.rule.id,
      reward: e.rule.reward,
    }));
  if (earnedRows.length > 0) {
    await admin.from("earned_rewards").insert(earnedRows);
  }

  // 5c'. Append-only `lifetime_completions` for the public leaderboard.
  //      Unlike `earned_rewards`, rows here are NEVER deleted by us, so
  //      time-limited challenges and admin rule deletions don't erase a
  //      user's historical record. `ignoreDuplicates: true` makes this
  //      a true "first earned wins" timestamp — re-scans don't overwrite
  //      `first_earned_at`.
  if (earnedRows.length > 0) {
    const lifetimeRows = earnedRows.map((r) => ({
      flow_address: r.flow_address,
      rule_id: r.rule_id,
      reward: r.reward,
    }));
    await admin
      .from("lifetime_completions")
      .upsert(lifetimeRows, {
        onConflict: "flow_address,rule_id",
        ignoreDuplicates: true,
      });
  }

  // 5d. Touch user row.
  await admin.from("users").upsert(
    { flow_address: address, last_verified_at: new Date().toISOString() },
    { onConflict: "flow_address" },
  );

  const challengeIds = [...challengeMomentIds(moments, rules)];
  const nearMissIds = [...nearMissMomentIds(moments, rules)];

  return NextResponse.json({
    address,
    moments,
    evaluations: result.evaluations,
    earnedRewards: result.earnedRewards,
    challengeMomentIds: challengeIds,
    nearMissMomentIds: nearMissIds,
    cached: false,
    lastVerifiedAt: new Date().toISOString(),
  });
}
