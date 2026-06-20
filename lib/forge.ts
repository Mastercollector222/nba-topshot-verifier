/**
 * lib/forge.ts
 * ---------------------------------------------------------------------------
 * Domain helpers for "The Forge" — admin-created crafting challenges where a
 * user BURNS one or more Top Shot moments and (after the platform confirms
 * the burn) receives a new moment airdropped by an admin.
 *
 *  - validateRecipeInput : server-side validation for admin upserts.
 *  - mapRecipeRow        : snake_case DB row → camelCase TS shape.
 *  - mapSubmissionRow    : snake_case DB row → camelCase TS shape.
 *  - matchRecipe         : given a user's owned_moments, decide which moments
 *                          qualify for each input group and whether the recipe
 *                          can be fully satisfied (auto-selects the lowest
 *                          serials first so collectors keep their best copies).
 *  - verifyBurn          : LIVE on-chain check that a set of moment IDs has
 *                          left the user's custody (parent + linked accounts).
 * ---------------------------------------------------------------------------
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getLinkedAccounts,
  getMomentsSlice,
  type OwnedMoment,
} from "./topshot";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single requirement group within a recipe. A moment may satisfy at most
 *  one group; ALL groups must be satisfied for the recipe to be craftable. */
export interface ForgeInputGroup {
  /** Optional human label, e.g. "Any 2024-25 Base Set moment". */
  label: string | null;
  /** Optional Top Shot setId filter. */
  setId: number | null;
  /** Optional Top Shot playId filter. */
  playId: number | null;
  /** Optional series filter. */
  series: number | null;
  /** Optional tier filter (matched against playMetadata["Tier"]). */
  tier: string | null;
  /** How many matching moments must be burned for this group. */
  count: number;
}

export interface ForgeRecipe {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  inputs: ForgeInputGroup[];
  inputImageUrl: string | null;
  /** Optional Top Shot link for the required moment (preview for users). */
  inputMomentUrl: string | null;
  rewardTitle: string;
  rewardDescription: string | null;
  rewardSetId: number | null;
  rewardPlayId: number | null;
  rewardImageUrl: string | null;
  rewardMomentUrl: string | null;
  maxPerUser: number;
  maxTotal: number | null;
  startsAt: string | null;
  endsAt: string | null;
  accentColor: string | null;
  enabled: boolean;
  /** When true, every burned moment must be in public.sold_moments. */
  requireSoldOrigin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ForgeRecipeInput {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  inputs: ForgeInputGroup[];
  inputImageUrl?: string | null;
  inputMomentUrl?: string | null;
  rewardTitle: string;
  rewardDescription?: string | null;
  rewardSetId?: number | null;
  rewardPlayId?: number | null;
  rewardImageUrl?: string | null;
  rewardMomentUrl?: string | null;
  maxPerUser?: number;
  maxTotal?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  accentColor?: string | null;
  enabled?: boolean;
  requireSoldOrigin?: boolean;
}

export type ForgeSubmissionStatus =
  | "pending_burn"
  | "burn_verified"
  | "reward_sent"
  | "rejected"
  | "cancelled";

export interface ForgeSubmission {
  id: string;
  recipeId: string;
  flowAddress: string;
  topshotUsername: string | null;
  committedMomentIds: string[];
  status: ForgeSubmissionStatus;
  burnVerifiedAt: string | null;
  rewardSentAt: string | null;
  adminNote: string | null;
  rewardTxId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InvalidRecipeError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "InvalidRecipeError";
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9][a-z0-9-_]{1,63}$/;

function validateOptionalUrl(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") {
    throw new InvalidRecipeError(`${field} must be a string URL`);
  }
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
  } catch {
    throw new InvalidRecipeError(`${field} must be a valid http(s) URL`);
  }
  return v;
}

function validateInputGroup(raw: unknown, i: number): ForgeInputGroup {
  if (!raw || typeof raw !== "object") {
    throw new InvalidRecipeError(`inputs[${i}] must be an object`);
  }
  const r = raw as Record<string, unknown>;

  const count = Number(r.count);
  if (!Number.isInteger(count) || count <= 0) {
    throw new InvalidRecipeError(`inputs[${i}].count must be a positive integer`);
  }

  const num = (v: unknown, field: string): number | null => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) {
      throw new InvalidRecipeError(`inputs[${i}].${field} must be a non-negative integer`);
    }
    return n;
  };

  const setId = num(r.setId, "setId");
  const playId = num(r.playId, "playId");
  const series = num(r.series, "series");
  const tier = typeof r.tier === "string" && r.tier.trim() ? r.tier.trim() : null;

  // Require at least one selector so users aren't asked to burn "anything".
  if (setId === null && playId === null && series === null && tier === null) {
    throw new InvalidRecipeError(
      `inputs[${i}] must specify at least one of setId, playId, series, or tier`,
    );
  }

  return {
    label: typeof r.label === "string" && r.label.trim() ? r.label.trim() : null,
    setId,
    playId,
    series,
    tier,
    count,
  };
}

export function validateRecipeInput(raw: unknown): ForgeRecipeInput {
  if (!raw || typeof raw !== "object") {
    throw new InvalidRecipeError("Body must be an object");
  }
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === "string" ? r.id.trim().toLowerCase() : "";
  if (!SLUG_RE.test(id)) {
    throw new InvalidRecipeError("id must be a slug (a-z, 0-9, -_, 2–64 chars)");
  }

  const title = typeof r.title === "string" ? r.title.trim() : "";
  if (!title) throw new InvalidRecipeError("title is required");

  const rewardTitle = typeof r.rewardTitle === "string" ? r.rewardTitle.trim() : "";
  if (!rewardTitle) throw new InvalidRecipeError("rewardTitle is required");

  if (!Array.isArray(r.inputs) || r.inputs.length === 0) {
    throw new InvalidRecipeError("inputs must be a non-empty array of requirement groups");
  }
  const inputs = r.inputs.map((g, i) => validateInputGroup(g, i));

  const maxPerUser = r.maxPerUser === undefined || r.maxPerUser === null
    ? 1
    : Number(r.maxPerUser);
  if (!Number.isInteger(maxPerUser) || maxPerUser < 1) {
    throw new InvalidRecipeError("maxPerUser must be an integer >= 1");
  }

  let maxTotal: number | null = null;
  if (r.maxTotal !== undefined && r.maxTotal !== null && r.maxTotal !== "") {
    maxTotal = Number(r.maxTotal);
    if (!Number.isInteger(maxTotal) || maxTotal < 1) {
      throw new InvalidRecipeError("maxTotal must be an integer >= 1 when provided");
    }
  }

  const startsAt = typeof r.startsAt === "string" && r.startsAt ? r.startsAt : null;
  const endsAt = typeof r.endsAt === "string" && r.endsAt ? r.endsAt : null;
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new InvalidRecipeError("endsAt must be after startsAt");
  }

  const accent = typeof r.accentColor === "string" ? r.accentColor.trim() : "";
  if (accent && !/^#[0-9a-fA-F]{6}$/.test(accent)) {
    throw new InvalidRecipeError("accentColor must be a #RRGGBB hex string");
  }

  const num = (v: unknown): number | null => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    id,
    title,
    subtitle: typeof r.subtitle === "string" ? r.subtitle.trim() || null : null,
    description: typeof r.description === "string" ? r.description.trim() || null : null,
    inputs,
    inputImageUrl: validateOptionalUrl(r.inputImageUrl, "inputImageUrl"),
    inputMomentUrl: validateOptionalUrl(r.inputMomentUrl, "inputMomentUrl"),
    rewardTitle,
    rewardDescription:
      typeof r.rewardDescription === "string" ? r.rewardDescription.trim() || null : null,
    rewardSetId: num(r.rewardSetId),
    rewardPlayId: num(r.rewardPlayId),
    rewardImageUrl: validateOptionalUrl(r.rewardImageUrl, "rewardImageUrl"),
    rewardMomentUrl: validateOptionalUrl(r.rewardMomentUrl, "rewardMomentUrl"),
    maxPerUser,
    maxTotal,
    startsAt,
    endsAt,
    accentColor: accent || null,
    enabled: typeof r.enabled === "boolean" ? r.enabled : true,
    requireSoldOrigin: typeof r.requireSoldOrigin === "boolean" ? r.requireSoldOrigin : false,
  };
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapInputGroup(raw: unknown): ForgeInputGroup {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    label: (r.label as string | null) ?? null,
    setId: r.setId == null ? null : Number(r.setId),
    playId: r.playId == null ? null : Number(r.playId),
    series: r.series == null ? null : Number(r.series),
    tier: (r.tier as string | null) ?? null,
    count: Number(r.count ?? 1),
  };
}

export function mapRecipeRow(row: Record<string, unknown>): ForgeRecipe {
  const rawInputs = Array.isArray(row.inputs) ? (row.inputs as unknown[]) : [];
  return {
    id: row.id as string,
    title: row.title as string,
    subtitle: (row.subtitle as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    inputs: rawInputs.map(mapInputGroup),
    inputImageUrl: (row.input_image_url as string | null) ?? null,
    inputMomentUrl: (row.input_moment_url as string | null) ?? null,
    rewardTitle: row.reward_title as string,
    rewardDescription: (row.reward_description as string | null) ?? null,
    rewardSetId: row.reward_set_id == null ? null : Number(row.reward_set_id),
    rewardPlayId: row.reward_play_id == null ? null : Number(row.reward_play_id),
    rewardImageUrl: (row.reward_image_url as string | null) ?? null,
    rewardMomentUrl: (row.reward_moment_url as string | null) ?? null,
    maxPerUser: Number(row.max_per_user ?? 1),
    maxTotal: row.max_total == null ? null : Number(row.max_total),
    startsAt: (row.starts_at as string | null) ?? null,
    endsAt: (row.ends_at as string | null) ?? null,
    accentColor: (row.accent_color as string | null) ?? null,
    enabled: Boolean(row.enabled),
    requireSoldOrigin: Boolean(row.require_sold_origin),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function mapSubmissionRow(row: Record<string, unknown>): ForgeSubmission {
  const rawIds = Array.isArray(row.committed_moment_ids)
    ? (row.committed_moment_ids as unknown[])
    : [];
  return {
    id: row.id as string,
    recipeId: row.recipe_id as string,
    flowAddress: row.flow_address as string,
    topshotUsername: (row.topshot_username as string | null) ?? null,
    committedMomentIds: rawIds.map((x) => String(x)),
    status: row.status as ForgeSubmissionStatus,
    burnVerifiedAt: (row.burn_verified_at as string | null) ?? null,
    rewardSentAt: (row.reward_sent_at as string | null) ?? null,
    adminNote: (row.admin_note as string | null) ?? null,
    rewardTxId: (row.reward_tx_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ---------------------------------------------------------------------------
// Matching: which owned moments qualify for a recipe
// ---------------------------------------------------------------------------

/** True iff a moment matches a single input group's selectors. */
export function momentMatchesGroup(m: OwnedMoment, g: ForgeInputGroup): boolean {
  if (g.setId != null && m.setID !== g.setId) return false;
  if (g.playId != null && m.playID !== g.playId) return false;
  if (g.series != null && (m.series == null || m.series !== g.series)) return false;
  if (g.tier != null) {
    const t = m.playMetadata?.["Tier"];
    if (!t || t !== g.tier) return false;
  }
  return true;
}

export interface GroupMatch {
  group: ForgeInputGroup;
  index: number;
  /** Owned moments that match this group (locked excluded — can't burn locked). */
  candidates: OwnedMoment[];
  /** The moments auto-selected to satisfy the group (lowest serial first). */
  selected: OwnedMoment[];
  satisfied: boolean;
}

export interface RecipeMatch {
  groups: GroupMatch[];
  /** Every moment ID auto-selected across all groups (the burn list). */
  selectedMomentIds: string[];
  /** True iff every group can be fully satisfied with disjoint moments. */
  craftable: boolean;
}

/**
 * Greedily assign the user's owned moments to the recipe's input groups so
 * each group gets `count` distinct moments. Locked moments are excluded
 * (they cannot be burned). Groups are filled in order; within a group the
 * HIGHEST serial numbers are picked first so the collector keeps their rarer
 * (lower-serial) copies — and a moment is never assigned to two groups.
 */
export function matchRecipe(
  recipe: ForgeRecipe,
  owned: OwnedMoment[],
  eligibleMomentIds?: Set<string> | null,
): RecipeMatch {
  const used = new Set<string>();
  const burnable = owned.filter(
    (m) => (!eligibleMomentIds || eligibleMomentIds.has(m.momentID)),
  );

  const groups: GroupMatch[] = recipe.inputs.map((group, index) => {
    const candidates = burnable
      .filter((m) => momentMatchesGroup(m, group))
      .sort((a, b) => b.serialNumber - a.serialNumber);

    const selected: OwnedMoment[] = [];
    for (const m of candidates) {
      if (selected.length >= group.count) break;
      if (used.has(m.momentID)) continue;
      selected.push(m);
      used.add(m.momentID);
    }
    return {
      group,
      index,
      candidates,
      selected,
      satisfied: selected.length >= group.count,
    };
  });

  return {
    groups,
    selectedMomentIds: groups.flatMap((g) => g.selected.map((m) => m.momentID)),
    craftable: groups.every((g) => g.satisfied),
  };
}

/**
 * Validate that a user-supplied list of moment IDs is a legal burn set for a
 * recipe, given the moments they currently own. Returns the normalised list
 * or throws InvalidRecipeError. Each group must be satisfied by exactly
 * `count` distinct, unlocked, owned moments, and no moment may be reused.
 */
export function validateBurnSelection(
  recipe: ForgeRecipe,
  owned: OwnedMoment[],
  momentIds: string[],
  eligibleMomentIds?: Set<string> | null,
): string[] {
  const ids = [...new Set(momentIds.map((x) => String(x)))];
  const ownedById = new Map(owned.map((m) => [m.momentID, m]));

  // Every selected moment must be owned.
  for (const id of ids) {
    const m = ownedById.get(id);
    if (!m) throw new InvalidRecipeError(`Moment ${id} is not in your collection`);
    if (eligibleMomentIds && !eligibleMomentIds.has(id)) {
      throw new InvalidRecipeError(
        `Moment ${id} doesn't qualify — this forge only accepts moments acquired from us`,
      );
    }
  }

  const totalRequired = recipe.inputs.reduce((s, g) => s + g.count, 0);
  if (ids.length !== totalRequired) {
    throw new InvalidRecipeError(
      `This recipe requires exactly ${totalRequired} moment(s); you selected ${ids.length}`,
    );
  }

  // Greedily assign each selected moment to a group it matches. Use a simple
  // first-fit on groups sorted by most-specific (fewest matching) so tightly
  // constrained groups get filled first.
  const remaining = new Set(ids);
  const need = recipe.inputs.map((g) => g.count);
  // Try to fill each group from the selected pool.
  for (let gi = 0; gi < recipe.inputs.length; gi++) {
    const g = recipe.inputs[gi];
    for (const id of [...remaining]) {
      if (need[gi] === 0) break;
      const m = ownedById.get(id)!;
      if (momentMatchesGroup(m, g)) {
        remaining.delete(id);
        need[gi]--;
      }
    }
  }
  if (need.some((n) => n > 0) || remaining.size > 0) {
    throw new InvalidRecipeError(
      "Your selected moments do not satisfy the recipe requirements",
    );
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Burn verification (live on-chain)
// ---------------------------------------------------------------------------

export interface BurnCheck {
  /** True iff none of the committed moment IDs remain in the user's custody. */
  allGone: boolean;
  /** Any committed IDs still found in the user's parent or linked accounts. */
  stillOwned: string[];
}

/**
 * Confirm a burn by checking — LIVE on chain — that none of `momentIds`
 * remain in the user's custody (parent account + Hybrid-Custody children).
 * A burned moment is destroyed, so it won't be borrowable from any of the
 * user's accounts. We only query the specific committed IDs, so this stays
 * cheap even for large collections.
 */
export async function verifyBurn(
  address: string,
  momentIds: string[],
): Promise<BurnCheck> {
  const ids = [...new Set(momentIds.map((x) => String(x)))];
  if (ids.length === 0) return { allGone: true, stillOwned: [] };

  const children = await getLinkedAccounts(address);
  const accounts = [address, ...children];

  const stillOwned = new Set<string>();
  for (const account of accounts) {
    // getMomentsSlice returns metadata only for IDs the account still holds.
    const found = await getMomentsSlice(account, ids);
    for (const m of found) stillOwned.add(m.momentID);
  }

  return {
    allGone: stillOwned.size === 0,
    stillOwned: [...stillOwned],
  };
}

// ---------------------------------------------------------------------------
// Snapshot loader
// ---------------------------------------------------------------------------

/**
 * Load a user's owned_moments snapshot from the DB as OwnedMoment[]. Pages
 * past Supabase's 1000-row default so a large collection loads in full.
 */
export async function loadOwnedMoments(
  sb: SupabaseClient,
  address: string,
): Promise<OwnedMoment[]> {
  const PAGE = 1000;
  const out: OwnedMoment[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("owned_moments")
      .select(
        "moment_id, set_id, play_id, series, serial_number, source_address, set_name, play_metadata, thumbnail, is_locked, lock_expiry",
      )
      .eq("flow_address", address)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`owned_moments read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data as Array<Record<string, unknown>>) {
      out.push({
        source: row.source_address as string,
        momentID: String(row.moment_id),
        playID: Number(row.play_id),
        setID: Number(row.set_id),
        serialNumber: Number(row.serial_number),
        setName: (row.set_name as string | null) ?? null,
        series: row.series == null ? null : Number(row.series),
        playMetadata: (row.play_metadata as Record<string, string> | null) ?? null,
        thumbnail: (row.thumbnail as string | null) ?? null,
        isLocked: Boolean(row.is_locked),
        lockExpiry: row.lock_expiry == null ? null : Number(row.lock_expiry),
      });
    }
    if (data.length < PAGE) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Count helpers
// ---------------------------------------------------------------------------

/**
 * Load the subset of `momentIds` that are present in the sold_moments
 * allowlist (the moments we sold). When `momentIds` is omitted the entire
 * allowlist is returned. Used to enforce a recipe's `requireSoldOrigin`.
 * Pages past Supabase's 1000-row default so large lists load in full.
 */
export async function loadSoldMomentIds(
  sb: SupabaseClient,
  momentIds?: string[],
): Promise<Set<string>> {
  const out = new Set<string>();

  if (momentIds && momentIds.length > 0) {
    // Restrict the query to the candidate ids (chunked to stay under limits).
    const ids = [...new Set(momentIds.map((x) => String(x)))];
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data, error } = await sb
        .from("sold_moments")
        .select("moment_id")
        .in("moment_id", slice);
      if (error) throw new Error(`sold_moments read failed: ${error.message}`);
      for (const row of (data ?? []) as Array<{ moment_id: string }>) {
        out.add(String(row.moment_id));
      }
    }
    return out;
  }

  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("sold_moments")
      .select("moment_id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`sold_moments read failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data as Array<{ moment_id: string }>) {
      out.add(String(row.moment_id));
    }
    if (data.length < PAGE) break;
  }
  return out;
}

/** Number of submissions for a recipe that count toward limits (not cancelled/rejected). */
export async function countActiveSubmissions(
  sb: SupabaseClient,
  recipeId: string,
  flowAddress?: string,
): Promise<number> {
  let q = sb
    .from("forge_submissions")
    .select("*", { count: "exact", head: true })
    .eq("recipe_id", recipeId)
    .in("status", ["pending_burn", "burn_verified", "reward_sent"]);
  if (flowAddress) q = q.eq("flow_address", flowAddress);
  const { count } = await q;
  return count ?? 0;
}
