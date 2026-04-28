/**
 * lib/treasureHunt.ts
 * ---------------------------------------------------------------------------
 * Domain types + validators + evaluator helpers for the Treasure Hunt feature.
 *
 * Architecture: a "treasure hunt" is metadata + a list of `RewardRule`s
 * (the same shape used everywhere else for rewards). The existing pure
 * `verify()` engine in lib/verify.ts evaluates each task without any
 * engine modifications.
 *
 * Three concepts:
 *   - GlobalGate: one rule (stored as singleton row) that protects access
 *     to /treasure-hunt as a whole.
 *   - Hunt: a row in `treasure_hunts` — title, prize, window, optional
 *     extra `gate_rule`, and a `task_rules` array.
 *   - HuntStatus: per-user evaluation result for a single hunt — gate
 *     status, per-task progress, eligibility for entry, has-already-entered.
 *
 * No I/O happens here; routes pass in fetched moments + DB rows.
 * ---------------------------------------------------------------------------
 */

import {
  validateSingleRule,
  verify,
  InvalidRuleError,
  type RewardRule,
  type RuleEvaluation,
} from "@/lib/verify";
import type { OwnedMoment } from "@/lib/topshot";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Singleton row from `treasure_hunt_settings`. The `global_gate` column
 * is the authoritative entry rule for the entire /treasure-hunt section.
 */
export interface TreasureHuntSettings {
  /** A RewardRule the user must earn to access /treasure-hunt at all. */
  globalGate: RewardRule | null;
  updatedAt: string;
}

/**
 * Server-shape row from `treasure_hunts`. JSONB columns are typed
 * explicitly so callers don't have to remember which fields are arrays.
 */
export interface TreasureHunt {
  id: string;
  title: string;
  theme: string | null;
  description: string | null;
  prizeTitle: string;
  prizeDescription: string | null;
  prizeImageUrl: string | null;
  startsAt: string;          // ISO timestamp
  endsAt: string;            // ISO timestamp
  /** Optional ADDITIONAL gate beyond the global one. */
  gateRule: RewardRule | null;
  /** Tasks the user must satisfy to be eligible for entry. */
  taskRules: RewardRule[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-user evaluation for a single hunt. Computed server-side per request
 * by passing the user's owned moments through the existing verifier.
 */
export interface HuntProgress {
  hunt: TreasureHunt;
  /** Whether the per-hunt extra gate (if any) is satisfied. Null if no gate. */
  perHuntGateEarned: boolean | null;
  /** One evaluation per task in the same order as `hunt.taskRules`. */
  taskEvaluations: RuleEvaluation[];
  /** True if every task `earned === true`. */
  allTasksComplete: boolean;
  /** True if the hunt is between starts_at and ends_at right now. */
  isWithinWindow: boolean;
  /** True if user is eligible to enter (window + gate + tasks). */
  canEnter: boolean;
  /** True if user has already entered this hunt. */
  hasEntered: boolean;
}

// ---------------------------------------------------------------------------
// Raw → typed mappers (Supabase returns snake_case)
// ---------------------------------------------------------------------------

/**
 * Map a `treasure_hunts` row to the canonical TS shape. Defensive about
 * jsonb fields which arrive as parsed objects but could be null/garbage
 * if a buggy row was inserted manually.
 */
export function mapHuntRow(row: Record<string, unknown>): TreasureHunt {
  const taskRulesRaw = row.task_rules;
  const taskRules: RewardRule[] = Array.isArray(taskRulesRaw)
    ? (taskRulesRaw as RewardRule[])
    : [];
  const gateRule =
    row.gate_rule && typeof row.gate_rule === "object"
      ? (row.gate_rule as RewardRule)
      : null;
  return {
    id: String(row.id),
    title: String(row.title),
    theme: (row.theme as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    prizeTitle: String(row.prize_title),
    prizeDescription: (row.prize_description as string | null) ?? null,
    prizeImageUrl: (row.prize_image_url as string | null) ?? null,
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    gateRule,
    taskRules,
    enabled: Boolean(row.enabled),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Admin-input validation
// ---------------------------------------------------------------------------

export class InvalidHuntError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidHuntError";
  }
}

/** Strict admin-input shape (camelCase on the wire to match the rest of
 * the API surface). Returns a normalized object suitable for upsert. */
export interface HuntInput {
  id: string;
  title: string;
  theme?: string;
  description?: string;
  prizeTitle: string;
  prizeDescription?: string;
  prizeImageUrl?: string;
  startsAt: string;
  endsAt: string;
  gateRule?: RewardRule | null;
  taskRules: RewardRule[];
  enabled?: boolean;
}

/**
 * Validate + normalize a hunt payload submitted by an admin. Re-validates
 * every nested rule via `validateSingleRule` so server cannot trust the
 * client's payload. Throws InvalidHuntError with a user-readable message.
 */
export function validateHuntInput(raw: unknown): HuntInput {
  if (!raw || typeof raw !== "object") {
    throw new InvalidHuntError("Hunt payload must be an object");
  }
  const r = raw as Record<string, unknown>;
  const id = (r.id ?? "").toString().trim();
  if (!/^[a-z0-9][a-z0-9-_]{1,63}$/i.test(id)) {
    throw new InvalidHuntError(
      "id must be a slug (letters, digits, dashes, underscores)",
    );
  }
  const title = (r.title ?? "").toString().trim();
  if (!title) throw new InvalidHuntError("title is required");
  const prizeTitle = (r.prizeTitle ?? "").toString().trim();
  if (!prizeTitle) throw new InvalidHuntError("prizeTitle is required");
  const startsAt = (r.startsAt ?? "").toString();
  const endsAt = (r.endsAt ?? "").toString();
  const startsMs = Date.parse(startsAt);
  const endsMs = Date.parse(endsAt);
  if (!Number.isFinite(startsMs)) {
    throw new InvalidHuntError("startsAt must be a valid ISO timestamp");
  }
  if (!Number.isFinite(endsMs)) {
    throw new InvalidHuntError("endsAt must be a valid ISO timestamp");
  }
  if (endsMs <= startsMs) {
    throw new InvalidHuntError("endsAt must be after startsAt");
  }
  // Validate optional gate rule and required task rules through the
  // existing validator so we never trust admin input.
  let gateRule: RewardRule | null = null;
  if (r.gateRule != null) {
    try {
      gateRule = validateSingleRule(r.gateRule);
    } catch (e) {
      throw new InvalidHuntError(
        `gateRule invalid: ${
          e instanceof InvalidRuleError ? e.message : "unknown"
        }`,
      );
    }
  }
  const tasksRaw = r.taskRules;
  if (!Array.isArray(tasksRaw) || tasksRaw.length === 0) {
    throw new InvalidHuntError("taskRules must be a non-empty array");
  }
  const taskRules: RewardRule[] = [];
  const seenIds = new Set<string>();
  tasksRaw.forEach((t, i) => {
    let parsed: RewardRule;
    try {
      parsed = validateSingleRule(t);
    } catch (e) {
      throw new InvalidHuntError(
        `taskRules[${i}] invalid: ${
          e instanceof InvalidRuleError ? e.message : "unknown"
        }`,
      );
    }
    if (seenIds.has(parsed.id)) {
      throw new InvalidHuntError(
        `taskRules[${i}] duplicate task id "${parsed.id}"`,
      );
    }
    seenIds.add(parsed.id);
    taskRules.push(parsed);
  });

  return {
    id,
    title,
    theme: (r.theme ?? "").toString() || undefined,
    description: (r.description ?? "").toString() || undefined,
    prizeTitle,
    prizeDescription: (r.prizeDescription ?? "").toString() || undefined,
    prizeImageUrl: (r.prizeImageUrl ?? "").toString() || undefined,
    startsAt,
    endsAt,
    gateRule,
    taskRules,
    enabled: typeof r.enabled === "boolean" ? r.enabled : true,
  };
}

// ---------------------------------------------------------------------------
// Snapshot reader — paginates past Supabase's 1000-row default cap so
// users with large collections (10k+) load completely. Same pattern as
// the GET handler in app/api/verify/route.ts.
// ---------------------------------------------------------------------------

/**
 * Read every `owned_moments` row for a user, paginating through
 * Supabase's default 1000-row response cap. Returns a fully-typed
 * `OwnedMoment[]` suitable for `verify()` / `evaluateHunt()`.
 *
 * Returns an empty array if the user has no snapshot yet; callers
 * decide whether to fall back to a live on-chain scan.
 */
export async function readOwnedMomentsSnapshot(
  sb: SupabaseClient,
  address: string,
): Promise<OwnedMoment[]> {
  const PAGE = 1000;
  const moments: OwnedMoment[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("owned_moments")
      .select(
        "moment_id, set_id, play_id, serial_number, set_name, series, source_address, is_locked, lock_expiry, play_metadata",
      )
      .eq("flow_address", address)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const row = r as {
        moment_id: string | number;
        set_id: number;
        play_id: number;
        serial_number: number;
        set_name: string | null;
        series: number | null;
        source_address: string;
        is_locked: boolean | null;
        lock_expiry: number | null;
        play_metadata: Record<string, string> | null;
      };
      moments.push({
        momentID: String(row.moment_id),
        setID: Number(row.set_id),
        playID: Number(row.play_id),
        serialNumber: Number(row.serial_number),
        setName: row.set_name,
        series: row.series,
        source: row.source_address,
        isLocked: Boolean(row.is_locked),
        lockExpiry: row.lock_expiry,
        playMetadata: row.play_metadata,
        thumbnail: null,
      });
    }
    if (data.length < PAGE) break;
  }
  return moments;
}

// ---------------------------------------------------------------------------
// Evaluation helpers
// ---------------------------------------------------------------------------

/**
 * Evaluate a single rule against a user's moments. Returns `true` if
 * earned, `false` otherwise. Convenience wrapper around `verify()` that
 * just returns the boolean.
 */
export function isRuleEarned(
  rule: RewardRule,
  moments: OwnedMoment[],
): boolean {
  const r = verify(moments, [rule]);
  return r.evaluations[0]?.earned === true;
}

/**
 * Compute per-user progress for a single hunt. Pure function; takes
 * everything it needs as arguments. The caller fetches `moments` once
 * and passes the same array to every hunt for efficiency.
 */
export function evaluateHunt(args: {
  hunt: TreasureHunt;
  moments: OwnedMoment[];
  hasEntered: boolean;
  /** Override "now" for testing; defaults to current wall clock. */
  now?: Date;
}): HuntProgress {
  const { hunt, moments, hasEntered } = args;
  const now = args.now ?? new Date();
  const startsMs = Date.parse(hunt.startsAt);
  const endsMs = Date.parse(hunt.endsAt);
  const isWithinWindow =
    now.getTime() >= startsMs && now.getTime() < endsMs;

  const perHuntGateEarned =
    hunt.gateRule == null ? null : isRuleEarned(hunt.gateRule, moments);

  // Reuse the existing verifier in one batch — efficient and consistent
  // with how rewards are evaluated everywhere else.
  const taskEvaluations =
    hunt.taskRules.length > 0
      ? verify(moments, hunt.taskRules).evaluations
      : [];
  const allTasksComplete =
    taskEvaluations.length > 0 && taskEvaluations.every((e) => e.earned);

  const gateOk = perHuntGateEarned === null || perHuntGateEarned === true;
  const canEnter =
    hunt.enabled &&
    isWithinWindow &&
    gateOk &&
    allTasksComplete &&
    !hasEntered;

  return {
    hunt,
    perHuntGateEarned,
    taskEvaluations,
    allTasksComplete,
    isWithinWindow,
    canEnter,
    hasEntered,
  };
}
