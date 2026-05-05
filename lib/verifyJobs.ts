/**
 * lib/verifyJobs.ts
 * ---------------------------------------------------------------------------
 * Background-worker for /api/verify scans.
 *
 *   POST /api/verify  →  inserts a `verify_jobs` row, schedules
 *                        `runVerifyJob(jobId)` via Next.js `after()`,
 *                        and returns `{ jobId }` immediately.
 *
 *   GET  /api/verify/jobs/[id] →  client polls for progress.
 *
 * The worker is responsible for the entire pipeline that used to live
 * inline in the POST handler:
 *
 *   1. Load enabled rules.
 *   2. Read the user's previous `owned_moments` snapshot from the DB
 *      (used as the cache for the delta scan; empty for first verifies
 *      or full-rescan jobs).
 *   3. Run the chain scan via `getDeltaForParent`, updating the job
 *      row with phase + fetched/total counters as it progresses.
 *   4. Persist the snapshot diff:
 *        - delete removed Moment rows
 *        - upsert refreshed rows (lock state may have changed)
 *        - insert brand-new Moments
 *   5. Recompute earned_rewards, lifetime_completions, badges.
 *   6. Mark the job `succeeded`.
 *
 * On any error, the catch block sets `status='failed'` + `error=<msg>`
 * so the dashboard surfaces it instead of spinning forever.
 *
 * IMPORTANT: this module never reads `cookies()` — the caller resolves
 * the address from the session and passes it explicitly. `after()`
 * callbacks should treat themselves as out-of-request work.
 * ---------------------------------------------------------------------------
 */

import { awardAutoBadges } from "./badges";
import { createNotification } from "./notifications";
import { supabaseAdmin } from "./supabase";
import {
  getAllMomentsForParent,
  getDeltaForParent,
  type DeltaProgress,
  type OwnedMoment,
  type SnapshotIndex,
} from "./topshot";
import {
  parseRewardsConfig,
  validateSingleRule,
  verify,
  type RewardRule,
} from "./verify";
import rewardsJson from "@/config/rewards.json";

// Throttle progress writes — Cadence can complete chunks faster than
// Supabase round-trips, and we don't need millisecond accuracy.
const PROGRESS_FLUSH_MS = 500;

interface ProgressCounters {
  phase: string;
  fetched: number;
  total: number;
  newCount: number;
  existingCount: number;
  removedCount: number;
}

/**
 * Read every existing `owned_moments` row for `address` and return them
 * indexed by `momentID`. Pages past Supabase's 1000-row default cap so
 * a 67k whale's snapshot loads in full.
 */
async function loadPrevSnapshot(
  address: string,
): Promise<{ map: SnapshotIndex; raw: OwnedMoment[] }> {
  const sb = supabaseAdmin();
  const PAGE = 1000;
  const all: OwnedMoment[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("owned_moments")
      .select(
        "moment_id, set_id, play_id, series, serial_number, source_address, set_name, play_metadata, thumbnail, is_locked, lock_expiry",
      )
      .eq("flow_address", address)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`prev snapshot read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data as Array<Record<string, unknown>>) {
      all.push({
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
      });
    }
    if (data.length < PAGE) break;
  }
  const map: SnapshotIndex = new Map();
  for (const m of all) map.set(m.momentID, m);
  return { map, raw: all };
}

/**
 * Load the active rules. Identical contract to the inline version that
 * used to live in the POST handler — DB first, falling back to the
 * shipped JSON config so a fresh project still verifies.
 */
async function loadRules(): Promise<RewardRule[]> {
  const sb = supabaseAdmin();
  const { data: dbRules } = await sb
    .from("reward_rules")
    .select("payload")
    .eq("enabled", true);
  if (dbRules && dbRules.length > 0) {
    return dbRules.map((row) =>
      validateSingleRule((row as { payload: unknown }).payload),
    );
  }
  return parseRewardsConfig(rewardsJson).rules;
}

/**
 * Convert an `OwnedMoment` into the DB row shape used by `owned_moments`
 * upserts. Centralised so insert + upsert paths stay consistent.
 */
function momentToRow(address: string, m: OwnedMoment) {
  return {
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
  };
}

/**
 * Apply a snapshot delta to `owned_moments`:
 *   - DELETE rows for removed momentIDs
 *   - UPSERT rows for everything else (covers both new + refreshed)
 *
 * Chunked at 500 rows/insert to stay under Supabase's request size cap.
 */
async function persistMomentsDelta(params: {
  address: string;
  finalMoments: OwnedMoment[];
  removedIds: string[];
  fullRescan: boolean;
}) {
  const { address, finalMoments, removedIds, fullRescan } = params;
  const sb = supabaseAdmin();

  if (fullRescan) {
    // Caller asked for a clean slate (or there was no prior snapshot
    // and removedIds is empty). Wipe + re-insert is simplest and avoids
    // any chance of stale rows from prior schema versions sticking around.
    await sb.from("owned_moments").delete().eq("flow_address", address);
  } else if (removedIds.length > 0) {
    // Delete removed rows in chunks — `in` filters have a length cap.
    const CHUNK = 500;
    for (let i = 0; i < removedIds.length; i += CHUNK) {
      const slice = removedIds.slice(i, i + CHUNK);
      const { error } = await sb
        .from("owned_moments")
        .delete()
        .eq("flow_address", address)
        .in("moment_id", slice);
      if (error) throw new Error(`delete removed moments: ${error.message}`);
    }
  }

  if (finalMoments.length === 0) return;

  const rows = finalMoments.map((m) => momentToRow(address, m));
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await sb
      .from("owned_moments")
      .upsert(slice, { onConflict: "flow_address,moment_id" });
    if (error) throw new Error(`upsert owned_moments: ${error.message}`);
  }
}

/**
 * Patch a verify_jobs row. Best-effort; logs but doesn't throw so a
 * progress write failure can't kill the scan.
 */
async function updateJob(
  jobId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin()
      .from("verify_jobs")
      .update(patch)
      .eq("id", jobId);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("verify_jobs update failed:", error.message);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("verify_jobs update threw:", e);
  }
}

/**
 * Mark a job as failed. Always best-effort.
 */
async function failJob(jobId: string, message: string): Promise<void> {
  await updateJob(jobId, {
    status: "failed",
    error: message,
    finished_at: new Date().toISOString(),
  });
}

/**
 * Main entry point. Designed to be called from inside `after()` — never
 * throws to the caller (errors are recorded on the job row instead).
 */
export async function runVerifyJob(params: {
  jobId: string;
  address: string;
  /** When true: skip delta fast-path and force a full metadata rescan. */
  fullRescan?: boolean;
  /** Optional caps mirroring the old POST query-string knobs. */
  limit?: number;
  metadataChunkSize?: number;
}): Promise<void> {
  const { jobId, address, fullRescan = false, limit, metadataChunkSize } =
    params;
  const startedAt = new Date().toISOString();

  try {
    await updateJob(jobId, {
      status: "running",
      phase: "enumerating",
      started_at: startedAt,
    });

    // ---- 1. Rules + 2. previous snapshot ---------------------------------
    const [rules, prev] = await Promise.all([
      loadRules(),
      fullRescan
        ? Promise.resolve({ map: new Map() as SnapshotIndex, raw: [] })
        : loadPrevSnapshot(address),
    ]);

    // ---- 3. Chain scan ---------------------------------------------------
    // We always go through `getDeltaForParent`. When `prev` is empty
    // (first verify or fullRescan=true) every id is "new" and the scan
    // degrades gracefully into a full metadata fetch — no second code
    // path needed.
    let lastFlush = 0;
    const counters: ProgressCounters = {
      phase: "enumerating",
      fetched: 0,
      total: 0,
      newCount: 0,
      existingCount: 0,
      removedCount: 0,
    };
    const onProgress = (p: DeltaProgress) => {
      counters.phase = p.phase;
      counters.fetched = p.fetched;
      counters.total = p.total;
      if (p.newCount != null) counters.newCount = p.newCount;
      if (p.existingCount != null) counters.existingCount = p.existingCount;
      if (p.removedCount != null) counters.removedCount = p.removedCount;
      const now = Date.now();
      if (now - lastFlush < PROGRESS_FLUSH_MS) return;
      lastFlush = now;
      void updateJob(jobId, {
        phase: counters.phase,
        fetched: counters.fetched,
        total: counters.total,
        new_count: counters.newCount,
        existing_count: counters.existingCount,
        removed_count: counters.removedCount,
      });
    };

    const delta = await getDeltaForParent(address, prev.map, {
      limit,
      metadataChunkSize,
      onProgress,
    });

    // Final pre-persist progress flush so the dashboard sees 100%.
    await updateJob(jobId, {
      phase: "persisting",
      fetched: delta.moments.length,
      total: delta.moments.length,
      new_count: delta.newIds.length,
      existing_count: delta.refreshedIds.length,
      removed_count: delta.removedIds.length,
    });

    // ---- 4. Persist snapshot diff ---------------------------------------
    await persistMomentsDelta({
      address,
      finalMoments: delta.moments,
      removedIds: delta.removedIds,
      fullRescan,
    });

    // ---- 5. Mirror rules + recompute reward state -----------------------
    const sb = supabaseAdmin();
    const rulesRows = rules.map((r) => ({
      id: r.id,
      type: r.type,
      reward: r.reward,
      payload: r,
      enabled: true,
      updated_at: new Date().toISOString(),
    }));
    if (rulesRows.length > 0) {
      await sb.from("reward_rules").upsert(rulesRows, { onConflict: "id" });
    }

    const result = verify(delta.moments, rules);

    // earned_rewards: full replace — reflects CURRENT qualifying state.
    await sb.from("earned_rewards").delete().eq("flow_address", address);
    const earnedRows = result.evaluations
      .filter((e) => e.earned)
      .map((e) => ({
        flow_address: address,
        rule_id: e.rule.id,
        reward: e.rule.reward,
      }));
    if (earnedRows.length > 0) {
      await sb.from("earned_rewards").insert(earnedRows);
    }

    // lifetime_completions: append-only, never overwrite first earn time.
    if (earnedRows.length > 0) {
      const lifetimeRows = result.evaluations
        .filter((e) => e.earned)
        .map((e) => ({
          flow_address: address,
          rule_id: e.rule.id,
          reward: e.rule.reward,
          tsr_points: Math.max(0, Math.floor(e.rule.tsrPoints ?? 0)),
        }));

      // Detect which rule_ids are truly NEW (not already in the table)
      // by reading existing rows before the upsert.
      const { data: existingRows } = await sb
        .from("lifetime_completions")
        .select("rule_id")
        .eq("flow_address", address)
        .in("rule_id", lifetimeRows.map((r) => r.rule_id));
      const alreadyEarned = new Set(
        (existingRows ?? []).map((r) => (r as { rule_id: string }).rule_id),
      );
      const newlyEarned = lifetimeRows.filter((r) => !alreadyEarned.has(r.rule_id));

      await sb
        .from("lifetime_completions")
        .upsert(lifetimeRows, {
          onConflict: "flow_address,rule_id",
          ignoreDuplicates: true,
        });

      // Fire a notification for each genuinely new completion.
      for (const row of newlyEarned) {
        void createNotification(sb, address, {
          kind: "challenge",
          title: "Challenge completed!",
          body: row.reward,
          href: `/profile/${address}`,
        });
      }

      await awardAutoBadges({
        address,
        ruleIds: lifetimeRows.map((r) => r.rule_id),
        client: sb,
      });
    }

    // Touch the user row.
    await sb.from("users").upsert(
      { flow_address: address, last_verified_at: new Date().toISOString() },
      { onConflict: "flow_address" },
    );

    // ---- 6. Mark succeeded ---------------------------------------------
    await updateJob(jobId, {
      status: "succeeded",
      phase: "succeeded",
      finished_at: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error(`verify job ${jobId} failed:`, msg);
    await failJob(jobId, msg.slice(0, 500));
  }
}

/**
 * Convenience: synchronous full scan path retained for callers that
 * truly need a blocking scan (e.g. one-off scripts, tests). Routes use
 * `runVerifyJob` instead. Wraps the legacy `getAllMomentsForParent` so
 * we don't lose that code path entirely.
 */
export async function syncFullScan(address: string): Promise<OwnedMoment[]> {
  return getAllMomentsForParent(address);
}
