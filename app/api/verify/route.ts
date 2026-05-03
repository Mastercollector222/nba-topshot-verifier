/**
 * /api/verify
 * ---------------------------------------------------------------------------
 *   GET  → fast cached read of the user's last verified snapshot. Re-runs
 *          the rules engine against that snapshot so admin rule edits
 *          reflect without a fresh chain scan. Returns 204 if the user
 *          has never verified.
 *   POST → kicks off a *background* chain scan. Returns immediately with
 *          `{ jobId }`. The dashboard polls
 *          `GET /api/verify/jobs/[id]` for progress, and once
 *          `status='succeeded'` re-fetches via the cached GET above.
 *
 * Auth: reads `sb-access` cookie → verifies our custom JWT → `sub` is
 * the authoritative Flow address. The client CANNOT override which
 * address we scan.
 *
 * Why background? Large collectors (50k+ Moments) can't finish their
 * scan inside Vercel's 60s default request timeout. The job pattern
 * lets the chain scan run for up to `maxDuration` (5 min on Pro)
 * decoupled from the HTTP response. See lib/verifyJobs.ts for the worker.
 * ---------------------------------------------------------------------------
 */

import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, verifyFlowSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { type OwnedMoment } from "@/lib/topshot";
import {
  verify,
  parseRewardsConfig,
  validateSingleRule,
  challengeMomentIds,
  nearMissMomentIds,
  type RewardRule,
} from "@/lib/verify";
import { getUserTsr } from "@/lib/tsr";
import { runVerifyJob } from "@/lib/verifyJobs";
import rewardsJson from "@/config/rewards.json";

// 5 minutes — required for the after() callback to finish a 67k
// collector's first scan. Vercel Pro plan caps at 300s; Hobby caps at 60.
// On Hobby, large initial scans will be cut short and the user will
// need to re-trigger; the delta path on the *second* attempt makes that
// cheap enough to fit in 60s.
export const maxDuration = 300;

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

  // Fetch last-verified timestamp + TSR balance in parallel.
  const [userRowRes, tsr] = await Promise.all([
    admin
      .from("users")
      .select("last_verified_at")
      .eq("flow_address", address)
      .maybeSingle(),
    getUserTsr(address, admin),
  ]);

  return NextResponse.json({
    address,
    moments,
    evaluations: result.evaluations,
    earnedRewards: result.earnedRewards,
    challengeMomentIds: challengeIds,
    nearMissMomentIds: nearMissIds,
    tsr,
    cached: true,
    lastVerifiedAt:
      (userRowRes.data as { last_verified_at: string } | null)
        ?.last_verified_at ?? null,
  });
}

/**
 * POST /api/verify
 * ---------------------------------------------------------------------------
 * Schedules a background chain scan for the signed-in user and returns
 * `{ jobId }` immediately. The dashboard polls `GET /api/verify/jobs/[id]`
 * for progress, and once the job reaches `status='succeeded'` it re-fetches
 * via the cached GET above to get the materialized snapshot.
 *
 * Query knobs (all optional):
 *   ?full=1           — skip the delta fast-path; force a full metadata
 *                       rescan (use sparingly; needed when TopShot
 *                       backfills set/play metadata on cached rows).
 *   ?limit=N          — cap total Moments scanned (debug aid).
 *   ?chunkSize=N      — override the metadata-script chunk size (default 50).
 * ---------------------------------------------------------------------------
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const fullRescan = url.searchParams.get("full") === "1";
  const limitParam = url.searchParams.get("limit");
  const chunkParam = url.searchParams.get("chunkSize");
  const limit = limitParam ? Math.max(1, Number(limitParam)) : undefined;
  const metadataChunkSize = chunkParam
    ? Math.max(1, Number(chunkParam))
    : undefined;

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

  // --- 2. Insert a queued job row. We do this synchronously (rather
  //         than from inside `after()`) so the response can include the
  //         job id the client will poll for.
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("verify_jobs")
    .insert({
      flow_address: address,
      status: "queued",
      phase: "queued",
      full_rescan: fullRescan,
    })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: `Could not create verify job: ${error?.message ?? "unknown"}` },
      { status: 500 },
    );
  }
  const jobId = (data as { id: string }).id;

  // --- 3. Schedule the background scan. `after()` keeps the function
  //         alive until the callback resolves (bounded by `maxDuration`).
  //         Errors inside the worker are recorded on the job row, so we
  //         do not need to swallow them here.
  after(() =>
    runVerifyJob({
      jobId,
      address,
      fullRescan,
      limit,
      metadataChunkSize,
    }),
  );

  return NextResponse.json({ jobId, status: "queued" }, { status: 202 });
}
