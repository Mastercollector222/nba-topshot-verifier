/**
 * lib/verify.ts
 * ---------------------------------------------------------------------------
 * Pure rules engine for the NBA Top Shot Ownership Verifier.
 *
 *   verify(moments, rules) -> VerificationResult
 *
 * - No IO. No fcl. Fully deterministic. Safe on both server and client.
 * - Input shape is the `OwnedMoment` returned by `lib/topshot.ts`.
 * - Rules are defined in `config/rewards.json` and parsed/validated here.
 *
 * Supported rule types (see PROJECT_MEMORY.md §5):
 *
 *   1. `specific_moments`
 *      User must own ALL listed momentIds.
 *
 *   2. `set_completion`
 *      User must own ≥ `minPercent`% of distinct plays in `setId`.
 *      Requires `totalPlays` to be provided in the rule (the count of
 *      plays the set contains). A future `get_set_data.cdc` script can
 *      populate this from chain; for now it's author-supplied.
 *
 *   3. `quantity`
 *      User must own ≥ `minCount` Moments matching an optional filter:
 *      `setId`, `playId`, `series`, `tier` (tier read from playMetadata).
 * ---------------------------------------------------------------------------
 */

import type { OwnedMoment } from "./topshot";

// ---------------------------------------------------------------------------
// Rule schema
// ---------------------------------------------------------------------------

/**
 * Optional fields describing the prize Moment an admin wants to airdrop
 * to winners, AND the Moment(s) the user must collect to qualify. These
 * are metadata only — the verifier never uses them to evaluate rules.
 * They're surfaced in the UI so users know what they're chasing, what
 * they won, and can click through to the NBA Top Shot listing for either.
 */
export interface RewardMomentDetails {
  /** Top Shot setId of the prize Moment. */
  rewardSetId?: number;
  /** Top Shot playId of the prize Moment. */
  rewardPlayId?: number;
  /** Free-form description shown to winners (e.g. "LeBron Legendary #/99"). */
  rewardDescription?: string;
  /** Direct nbatopshot.com link to the prize Moment listing/page. */
  rewardMomentUrl?: string;
  /** Direct nbatopshot.com link to the *required* challenge Moment listing. */
  challengeMomentUrl?: string;
}

/**
 * Shared lock-state gating options. When present, ONLY Moments that are
 * currently locked (optionally through at least `requireLockedUntil`) count
 * toward the rule's required state.
 *
 *   - `requireLocked: true`  → Moment must be `isLocked === true`.
 *   - `requireLockedUntil`   → UFix64 seconds since epoch; the Moment's
 *                              `lockExpiry` must be >= this value (i.e. the
 *                              user must keep it locked at least that long).
 *                              Implies `requireLocked: true`.
 *
 * A Moment with no lockExpiry (perpetual lock) always satisfies any
 * `requireLockedUntil` check.
 */
export interface LockingGate {
  requireLocked?: boolean;
  requireLockedUntil?: number;
}

/** True iff the Moment satisfies the optional locking gate. */
function passesLockGate(m: OwnedMoment, gate: LockingGate): boolean {
  const needsLock =
    gate.requireLocked === true || gate.requireLockedUntil !== undefined;
  if (!needsLock) return true;
  if (!m.isLocked) return false;
  if (gate.requireLockedUntil !== undefined) {
    // A null lockExpiry means "no expiry set" → always satisfies a deadline.
    if (m.lockExpiry !== null && m.lockExpiry < gate.requireLockedUntil) {
      return false;
    }
  }
  return true;
}

export interface SpecificMomentsRule extends RewardMomentDetails, LockingGate {
  id: string;
  type: "specific_moments";
  /** Globally unique Top Shot Moment NFT ids (UInt64 as number or string). */
  momentIds: Array<number | string>;
  reward: string;
}

export interface SetCompletionRule extends RewardMomentDetails, LockingGate {
  id: string;
  type: "set_completion";
  setId: number;
  /** Total distinct plays in this set. Required for percent math. */
  totalPlays: number;
  /** Minimum ownership percentage (1–100). Defaults to 100. */
  minPercent?: number;
  reward: string;
}

export interface QuantityRule extends RewardMomentDetails, LockingGate {
  id: string;
  type: "quantity";
  minCount: number;
  /** Optional filters — all provided filters must match (AND). */
  setId?: number;
  playId?: number;
  series?: string | number;
  /** Matched against `playMetadata["Tier"]` if present. */
  tier?: string;
  reward: string;
}

export type RewardRule =
  | SpecificMomentsRule
  | SetCompletionRule
  | QuantityRule;

export interface RewardsConfig {
  rules: RewardRule[];
}

// ---------------------------------------------------------------------------
// Verification result shape
// ---------------------------------------------------------------------------

export interface RuleEvaluation {
  rule: RewardRule;
  /** True if the user qualifies for this reward. */
  earned: boolean;
  /** Fraction in [0, 1] expressing how close the user is to qualifying. */
  progress: number;
  /** Human-readable status (e.g. "3 of 5 moments found", "42%"). */
  detail: string;
  /**
   * For `specific_moments`: the subset of required `momentIds` actually owned.
   * For `set_completion`: distinct play IDs from the set that the user owns.
   * For `quantity`: the count of matched moments.
   */
  matched?: Array<number | string>;
  matchedCount?: number;
}

export interface VerificationResult {
  evaluations: RuleEvaluation[];
  earnedRewards: string[];
}

// ---------------------------------------------------------------------------
// Rule validation (lightweight — no Zod dependency)
// ---------------------------------------------------------------------------

export class InvalidRuleError extends Error {
  constructor(message: string, public readonly ruleIndex?: number) {
    super(message);
    this.name = "InvalidRuleError";
  }
}

/** Validates + returns a typed `RewardsConfig`. Throws `InvalidRuleError`. */
export function parseRewardsConfig(input: unknown): RewardsConfig {
  if (!input || typeof input !== "object" || !("rules" in input)) {
    throw new InvalidRuleError("Config must be an object with a `rules` array");
  }
  const rulesRaw = (input as { rules: unknown }).rules;
  if (!Array.isArray(rulesRaw)) {
    throw new InvalidRuleError("`rules` must be an array");
  }
  const rules: RewardRule[] = rulesRaw.map((r, i) => validateRule(r, i));
  const seen = new Set<string>();
  for (const r of rules) {
    if (seen.has(r.id)) {
      throw new InvalidRuleError(`Duplicate rule id: ${r.id}`);
    }
    seen.add(r.id);
  }
  return { rules };
}

/** Public single-rule validator — throws `InvalidRuleError` on bad input. */
export function validateSingleRule(raw: unknown): RewardRule {
  return validateRule(raw, 0);
}

/**
 * Allow only well-formed http(s) URLs for the optional Moment-page links.
 * Empty / undefined are fine — the fields are purely UX metadata.
 */
function validateOptionalUrl(
  v: unknown,
  field: string,
  index: number,
): void {
  if (v === undefined || v === null || v === "") return;
  if (typeof v !== "string") {
    throw new InvalidRuleError(`${field} must be a string URL`, index);
  }
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error("non-http");
    }
  } catch {
    throw new InvalidRuleError(
      `${field} must be a valid http(s) URL`,
      index,
    );
  }
}

function validateRewardMomentDetails(
  r: Record<string, unknown>,
  index: number,
): void {
  validateOptionalUrl(r.rewardMomentUrl, "rewardMomentUrl", index);
  validateOptionalUrl(r.challengeMomentUrl, "challengeMomentUrl", index);
}

function validateLockingGate(r: Record<string, unknown>, index: number): void {
  if (r.requireLocked !== undefined && typeof r.requireLocked !== "boolean") {
    throw new InvalidRuleError(
      "requireLocked must be a boolean when provided",
      index,
    );
  }
  if (
    r.requireLockedUntil !== undefined &&
    (typeof r.requireLockedUntil !== "number" || r.requireLockedUntil < 0)
  ) {
    throw new InvalidRuleError(
      "requireLockedUntil must be a non-negative number (UFix64 seconds)",
      index,
    );
  }
}

function validateRule(raw: unknown, index: number): RewardRule {
  if (!raw || typeof raw !== "object") {
    throw new InvalidRuleError("Rule must be an object", index);
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id.length === 0) {
    throw new InvalidRuleError("Rule.id must be a non-empty string", index);
  }
  if (typeof r.reward !== "string" || r.reward.length === 0) {
    throw new InvalidRuleError("Rule.reward must be a non-empty string", index);
  }
  switch (r.type) {
    case "specific_moments": {
      if (!Array.isArray(r.momentIds) || r.momentIds.length === 0) {
        throw new InvalidRuleError(
          "specific_moments.momentIds must be a non-empty array",
          index,
        );
      }
      for (const m of r.momentIds) {
        if (typeof m !== "number" && typeof m !== "string") {
          throw new InvalidRuleError(
            "specific_moments.momentIds entries must be number | string",
            index,
          );
        }
      }
      validateLockingGate(r, index);
      validateRewardMomentDetails(r, index);
      return r as unknown as SpecificMomentsRule;
    }
    case "set_completion": {
      if (typeof r.setId !== "number") {
        throw new InvalidRuleError("set_completion.setId must be a number", index);
      }
      if (typeof r.totalPlays !== "number" || r.totalPlays <= 0) {
        throw new InvalidRuleError(
          "set_completion.totalPlays must be a positive number",
          index,
        );
      }
      if (
        r.minPercent !== undefined &&
        (typeof r.minPercent !== "number" ||
          r.minPercent <= 0 ||
          r.minPercent > 100)
      ) {
        throw new InvalidRuleError(
          "set_completion.minPercent must be a number in (0, 100]",
          index,
        );
      }
      validateLockingGate(r, index);
      validateRewardMomentDetails(r, index);
      return r as unknown as SetCompletionRule;
    }
    case "quantity": {
      if (typeof r.minCount !== "number" || r.minCount <= 0) {
        throw new InvalidRuleError(
          "quantity.minCount must be a positive number",
          index,
        );
      }
      validateLockingGate(r, index);
      validateRewardMomentDetails(r, index);
      return r as unknown as QuantityRule;
    }
    default:
      throw new InvalidRuleError(
        `Unknown rule type: ${String(r.type)}`,
        index,
      );
  }
}

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------

/** Normalize a Moment id for comparison across number/string sources. */
function idKey(v: number | string): string {
  return String(v);
}

function evalSpecificMoments(
  rule: SpecificMomentsRule,
  moments: OwnedMoment[],
): RuleEvaluation {
  const required = rule.momentIds.map(idKey);
  // When locking is required, only count Moments that pass the lock gate.
  const eligibleIds = new Set<string>();
  for (const m of moments) {
    if (passesLockGate(m, rule)) eligibleIds.add(idKey(m.momentID));
  }
  const matched = required.filter((id) => eligibleIds.has(id));
  const earned = matched.length === required.length;
  const progress = required.length === 0 ? 1 : matched.length / required.length;
  const lockNote =
    rule.requireLocked || rule.requireLockedUntil !== undefined
      ? " (locked only)"
      : "";
  return {
    rule,
    earned,
    progress,
    detail: `${matched.length} of ${required.length} required Moments owned${lockNote}`,
    matched,
    matchedCount: matched.length,
  };
}

function evalSetCompletion(
  rule: SetCompletionRule,
  moments: OwnedMoment[],
): RuleEvaluation {
  const threshold = rule.minPercent ?? 100;
  const distinctPlaysInSet = new Set<number>();
  for (const m of moments) {
    if (m.setID !== rule.setId) continue;
    if (!passesLockGate(m, rule)) continue;
    distinctPlaysInSet.add(m.playID);
  }
  const ownedPlays = distinctPlaysInSet.size;
  const percent = (ownedPlays / rule.totalPlays) * 100;
  const earned = percent >= threshold;
  // Progress measured relative to the completion threshold.
  const progress = Math.min(1, percent / threshold);
  return {
    rule,
    earned,
    progress,
    detail: `${ownedPlays}/${rule.totalPlays} plays (${percent.toFixed(1)}%), need ${threshold}%`,
    matched: [...distinctPlaysInSet],
    matchedCount: ownedPlays,
  };
}

function momentMatchesQuantityFilter(
  m: OwnedMoment,
  rule: QuantityRule,
): boolean {
  if (rule.setId !== undefined && m.setID !== rule.setId) return false;
  if (rule.playId !== undefined && m.playID !== rule.playId) return false;
  if (rule.series !== undefined) {
    // series on-chain is a UInt32 (number | null). Rule can specify number
    // or a string like "2024-25" — compare loosely via String().
    if (m.series == null || String(m.series) !== String(rule.series)) {
      return false;
    }
  }
  if (rule.tier !== undefined) {
    const t = m.playMetadata?.["Tier"];
    if (!t || t !== rule.tier) return false;
  }
  if (!passesLockGate(m, rule)) return false;
  return true;
}

function evalQuantity(
  rule: QuantityRule,
  moments: OwnedMoment[],
): RuleEvaluation {
  let count = 0;
  for (const m of moments) {
    if (momentMatchesQuantityFilter(m, rule)) count++;
  }
  const earned = count >= rule.minCount;
  const progress = rule.minCount === 0 ? 1 : Math.min(1, count / rule.minCount);
  return {
    rule,
    earned,
    progress,
    detail: `${count} of ${rule.minCount} matching Moments`,
    matchedCount: count,
  };
}

/**
 * Evaluate every rule against a user's owned Moments.
 * Pure function — no side effects, safe to unit-test.
 */
export function verify(
  moments: OwnedMoment[],
  rules: RewardRule[],
): VerificationResult {
  const evaluations: RuleEvaluation[] = rules.map((rule) => {
    switch (rule.type) {
      case "specific_moments":
        return evalSpecificMoments(rule, moments);
      case "set_completion":
        return evalSetCompletion(rule, moments);
      case "quantity":
        return evalQuantity(rule, moments);
    }
  });

  const earnedRewards = evaluations
    .filter((e) => e.earned)
    .map((e) => e.rule.reward);

  return { evaluations, earnedRewards };
}

/**
 * Returns the set of Moment IDs (as strings) that are "challenge-matching"
 * for at least one of the given rules — i.e. they would contribute to the
 * rule's progress if the user kept owning them.
 *
 * Used by the dashboard to highlight challenge Moments in the grid.
 */
export function challengeMomentIds(
  moments: OwnedMoment[],
  rules: RewardRule[],
): Set<string> {
  const out = new Set<string>();
  for (const rule of rules) {
    switch (rule.type) {
      case "specific_moments": {
        const wanted = new Set(rule.momentIds.map(idKey));
        for (const m of moments) {
          if (!wanted.has(idKey(m.momentID))) continue;
          if (!passesLockGate(m, rule)) continue;
          out.add(idKey(m.momentID));
        }
        break;
      }
      case "set_completion": {
        for (const m of moments) {
          if (m.setID !== rule.setId) continue;
          if (!passesLockGate(m, rule)) continue;
          out.add(idKey(m.momentID));
        }
        break;
      }
      case "quantity": {
        for (const m of moments) {
          if (momentMatchesQuantityFilter(m, rule)) {
            out.add(idKey(m.momentID));
          }
        }
        break;
      }
    }
  }
  return out;
}

/** True iff the Moment matches a quantity rule's *selectors* (set / play /
 *  series / tier) regardless of whether it's locked. Used by
 *  `nearMissMomentIds` to find Moments the user owns but hasn't yet locked. */
function momentMatchesQuantitySelectors(
  m: OwnedMoment,
  rule: QuantityRule,
): boolean {
  if (rule.setId != null && m.setID !== rule.setId) return false;
  if (rule.playId != null && m.playID !== rule.playId) return false;
  if (rule.series != null && m.series !== rule.series) return false;
  if (rule.tier != null) {
    const t = m.playMetadata?.["Tier"];
    if (!t || t !== rule.tier) return false;
  }
  return true;
}

/**
 * Returns Moment IDs the user owns that *would* count toward an active
 * rule if only they were locked — i.e. they match the rule's selectors
 * (set / play / momentId / etc.) but fail the locking gate.
 *
 * Used by the dashboard to surface "near-miss" Moments right after the
 * already-counted challenge Moments, so users can see what to lock to
 * complete a challenge. Rules with no locking requirement contribute
 * nothing here (a non-gated rule has no near-misses by definition).
 *
 * Disjoint from `challengeMomentIds`: any Moment that already counts
 * cannot also be a near-miss.
 */
export function nearMissMomentIds(
  moments: OwnedMoment[],
  rules: RewardRule[],
): Set<string> {
  const out = new Set<string>();
  for (const rule of rules) {
    const needsLock =
      rule.requireLocked === true || rule.requireLockedUntil !== undefined;
    if (!needsLock) continue;

    switch (rule.type) {
      case "specific_moments": {
        const wanted = new Set(rule.momentIds.map(idKey));
        for (const m of moments) {
          if (!wanted.has(idKey(m.momentID))) continue;
          if (passesLockGate(m, rule)) continue; // already a full match
          out.add(idKey(m.momentID));
        }
        break;
      }
      case "set_completion": {
        for (const m of moments) {
          if (m.setID !== rule.setId) continue;
          if (passesLockGate(m, rule)) continue;
          out.add(idKey(m.momentID));
        }
        break;
      }
      case "quantity": {
        for (const m of moments) {
          if (!momentMatchesQuantitySelectors(m, rule)) continue;
          if (passesLockGate(m, rule)) continue;
          out.add(idKey(m.momentID));
        }
        break;
      }
    }
  }
  return out;
}
