/**
 * lib/topshot.ts
 * ---------------------------------------------------------------------------
 * Typed wrappers around the Cadence scripts in `cadence/scripts/`.
 * These are the ONLY sanctioned read paths for Top Shot + Hybrid Custody
 * ownership data in the app. All are read-only (`fcl.query`).
 *
 * Scripts are inlined as string constants (not read from disk) so that:
 *   - They work uniformly in Server Components, Route Handlers, and client
 *     bundles without a file-system dependency.
 *   - Deployments don't need to ship the `cadence/` folder.
 *
 * The source of truth remains the `.cdc` files under `cadence/scripts/` —
 * keep the literals here in sync with those files.
 * ---------------------------------------------------------------------------
 */

import { runQuery, t } from "./flow";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OwnedMoment {
  /** Flow address of the account actually holding the Moment (parent or child). */
  source: string;
  /** Globally unique Top Shot Moment NFT id (Cadence UInt64 → string). */
  momentID: string;
  /** Top Shot Play id. */
  playID: number;
  /** Top Shot Set id. */
  setID: number;
  /** Serial number within (setID, playID). */
  serialNumber: number;
  /** Human-readable Set name (e.g. "Base Set"), if resolvable. */
  setName: string | null;
  /** Series number (e.g. 0, 1, 2, …), if resolvable. */
  series: number | null;
  /** Raw play metadata: PlayerName, TeamAtMoment, DateOfMoment, … */
  playMetadata: Record<string, string> | null;
  /** CDN URL for the Moment's thumbnail image (from MetadataViews.Display). */
  thumbnail: string | null;
  /** True if TopShotLocking has this Moment locked (e.g. for a challenge). */
  isLocked: boolean;
  /**
   * Unix-epoch seconds (UFix64) at which the lock expires; `null` if not
   * locked. Stored as a number because UFix64 is a fixed-point seconds value.
   */
  lockExpiry: number | null;
}

export interface MomentMetadata {
  momentID: string;
  playID: number;
  setID: number;
  serialNumber: number;
  setName: string | null;
  series: number | null;
  playMetadata: Record<string, string> | null;
}

// ---------------------------------------------------------------------------
// Inlined Cadence scripts (kept in sync with cadence/scripts/*.cdc)
// ---------------------------------------------------------------------------

const GET_LINKED_ACCOUNTS = /* cadence */ `
import HybridCustody from 0xHybridCustody

access(all) fun main(parent: Address): [Address] {
    let managerRef = getAccount(parent).capabilities
        .borrow<&HybridCustody.Manager>(HybridCustody.ManagerPublicPath)
    if managerRef == nil {
        return []
    }
    return managerRef!.getChildAddresses()
}
`;

const GET_MOMENT_IDS = /* cadence */ `
import TopShot from 0xTopShot
import NonFungibleToken from 0xNonFungibleToken

access(all) fun main(owner: Address): [UInt64] {
    let collectionRef = getAccount(owner).capabilities
        .borrow<&TopShot.Collection>(/public/MomentCollection)
    if collectionRef == nil {
        return []
    }
    return collectionRef!.getIDs()
}
`;

// Mirrors cadence/scripts/get_set_data.cdc — used by the admin "set
// completion" rule builder so authors don't have to hand-enter play counts.
const GET_SET_DATA = /* cadence */ `
import TopShot from 0xTopShot

access(all) struct SetData {
    access(all) let setID: UInt32
    access(all) let setName: String?
    access(all) let series: UInt32?
    access(all) let totalPlays: UInt32
    access(all) let playIDs: [UInt32]

    init(
        setID: UInt32,
        setName: String?,
        series: UInt32?,
        totalPlays: UInt32,
        playIDs: [UInt32]
    ) {
        self.setID = setID
        self.setName = setName
        self.series = series
        self.totalPlays = totalPlays
        self.playIDs = playIDs
    }
}

access(all) fun main(setID: UInt32): SetData? {
    let plays: [UInt32]? = TopShot.getPlaysInSet(setID: setID)
    if plays == nil {
        return nil
    }
    let setName: String? = TopShot.getSetName(setID: setID)
    let series: UInt32? = TopShot.getSetSeries(setID: setID)
    let playList = plays!
    return SetData(
        setID: setID,
        setName: setName,
        series: series,
        totalPlays: UInt32(playList.length),
        playIDs: playList
    )
}
`;

const GET_MOMENTS_SLICE = /* cadence */ `
import TopShot from 0xTopShot
import TopShotLocking from 0xTopShot
import MetadataViews from 0xMetadataViews
import NonFungibleToken from 0xNonFungibleToken

access(all) struct OwnedMoment {
    access(all) let source: Address
    access(all) let momentID: UInt64
    access(all) let playID: UInt32
    access(all) let setID: UInt32
    access(all) let serialNumber: UInt32
    access(all) let setName: String?
    access(all) let series: UInt32?
    access(all) let playMetadata: {String: String}?
    access(all) let thumbnail: String?
    access(all) let isLocked: Bool
    access(all) let lockExpiry: UFix64?

    init(
        source: Address,
        momentID: UInt64,
        playID: UInt32,
        setID: UInt32,
        serialNumber: UInt32,
        setName: String?,
        series: UInt32?,
        playMetadata: {String: String}?,
        thumbnail: String?,
        isLocked: Bool,
        lockExpiry: UFix64?
    ) {
        self.source = source
        self.momentID = momentID
        self.playID = playID
        self.setID = setID
        self.serialNumber = serialNumber
        self.setName = setName
        self.series = series
        self.playMetadata = playMetadata
        self.thumbnail = thumbnail
        self.isLocked = isLocked
        self.lockExpiry = lockExpiry
    }
}

access(all) fun main(owner: Address, ids: [UInt64]): [OwnedMoment] {
    let result: [OwnedMoment] = []
    let collectionRef = getAccount(owner).capabilities
        .borrow<&TopShot.Collection>(/public/MomentCollection)
    if collectionRef == nil {
        return result
    }
    for id in ids {
        let momentRef = collectionRef!.borrowMoment(id: id)
        if momentRef == nil {
            continue
        }
        let data = momentRef!.data

        // Resolve the MetadataViews.Display thumbnail (a CDN URL). TopShot
        // NFTs implement ViewResolver so this is cheap relative to borrow.
        var thumbnail: String? = nil
        let rawView = momentRef!.resolveView(Type<MetadataViews.Display>())
        if rawView != nil {
            let display = rawView! as! MetadataViews.Display
            thumbnail = display.thumbnail.uri()
        }

        // TopShotLocking: lock state + optional expiry. getLockExpiry panics
        // when the NFT is not locked, so we must guard with isLocked.
        let nftRef = momentRef! as &{NonFungibleToken.NFT}
        let locked = TopShotLocking.isLocked(nftRef: nftRef)
        let expiry: UFix64? = locked
            ? TopShotLocking.getLockExpiry(nftRef: nftRef)
            : nil

        result.append(OwnedMoment(
            source: owner,
            momentID: id,
            playID: data.playID,
            setID: data.setID,
            serialNumber: data.serialNumber,
            setName: TopShot.getSetName(setID: data.setID),
            series: TopShot.getSetSeries(setID: data.setID),
            playMetadata: TopShot.getPlayMetaData(playID: data.playID),
            thumbnail: thumbnail,
            isLocked: locked,
            lockExpiry: expiry
        ))
    }
    return result
}
`;

// NOTE: The single-call aggregator script (`cadence/scripts/get_all_moments_for_parent.cdc`)
// is no longer used at runtime — it doesn't survive Cadence's execution-time
// limit on large collections. See `getAllMomentsForParent()` below for the
// two-phase replacement that uses `GET_MOMENTS_SLICE` in chunks.

// "Lite" sibling of GET_MOMENTS_SLICE — returns ONLY lock state for each
// requested Moment id. No MetadataViews resolve, no set/play lookups. This
// script is ~2 orders of magnitude cheaper than GET_MOMENTS_SLICE and can
// safely run with chunkSize ≈ 300–500 without tripping Cadence's per-script
// compute budget. Used by the delta-scan path on /api/verify so re-verifies
// only re-fetch the bits of state that actually change day-to-day.
const GET_LOCK_STATE_SLICE = /* cadence */ `
import TopShot from 0xTopShot
import TopShotLocking from 0xTopShot
import NonFungibleToken from 0xNonFungibleToken

access(all) struct LockState {
    access(all) let momentID: UInt64
    access(all) let isLocked: Bool
    access(all) let lockExpiry: UFix64?

    init(momentID: UInt64, isLocked: Bool, lockExpiry: UFix64?) {
        self.momentID = momentID
        self.isLocked = isLocked
        self.lockExpiry = lockExpiry
    }
}

access(all) fun main(owner: Address, ids: [UInt64]): [LockState] {
    let result: [LockState] = []
    let collectionRef = getAccount(owner).capabilities
        .borrow<&TopShot.Collection>(/public/MomentCollection)
    if collectionRef == nil {
        return result
    }
    for id in ids {
        let momentRef = collectionRef!.borrowMoment(id: id)
        if momentRef == nil {
            continue
        }
        let nftRef = momentRef! as &{NonFungibleToken.NFT}
        let locked = TopShotLocking.isLocked(nftRef: nftRef)
        let expiry: UFix64? = locked
            ? TopShotLocking.getLockExpiry(nftRef: nftRef)
            : nil
        result.append(LockState(
            momentID: id,
            isLocked: locked,
            lockExpiry: expiry
        ))
    }
    return result
}
`;

// ---------------------------------------------------------------------------
// Typed query wrappers
// ---------------------------------------------------------------------------

/**
 * Returns every child-account address linked to `parent` via Hybrid Custody.
 * Empty list if the user has no `HybridCustody.Manager` published.
 */
export async function getLinkedAccounts(parent: string): Promise<string[]> {
  return runQuery<string[]>({
    cadence: GET_LINKED_ACCOUNTS,
    args: (arg, types) => [arg(parent, (types as typeof t).Address)],
    address: parent,
  });
}

/**
 * On-chain set metadata used by the admin "set completion" rule builder.
 * `totalPlays` is the count required to fully complete the set (one of
 * each play). Returns `null` for unknown set IDs.
 */
export interface SetData {
  setID: number;
  setName: string | null;
  series: number | null;
  totalPlays: number;
  playIDs: number[];
}

export async function getSetData(setID: number): Promise<SetData | null> {
  const raw = await runQuery<Record<string, unknown> | null>({
    cadence: GET_SET_DATA,
    args: (arg, types) => [
      arg(String(setID), (types as typeof t).UInt32),
    ],
    // No specific address rate-limit bucket — set lookups are global.
    address: "set-data",
  });
  if (!raw) return null;
  return {
    setID: Number(raw.setID),
    setName: (raw.setName ?? null) as string | null,
    series: raw.series == null ? null : Number(raw.series),
    totalPlays: Number(raw.totalPlays ?? 0),
    playIDs: Array.isArray(raw.playIDs)
      ? (raw.playIDs as unknown[]).map((x) => Number(x))
      : [],
  };
}

/**
 * Returns every Top Shot Moment ID owned directly by `address`.
 * Does NOT traverse linked children — use `getAllMomentsForParent` for that.
 * UInt64s come back as strings (JSON-Cadence).
 */
export async function getMomentIds(address: string): Promise<string[]> {
  return runQuery<string[]>({
    cadence: GET_MOMENT_IDS,
    args: (arg, types) => [arg(address, (types as typeof t).Address)],
    address,
  });
}

/**
 * Fetches metadata for a specific slice of Moment IDs owned by `owner`.
 * Used internally by the two-phase aggregator below, but exported in case
 * a caller wants to stream Moments themselves.
 */
export async function getMomentsSlice(
  owner: string,
  ids: Array<string | number>,
): Promise<OwnedMoment[]> {
  if (ids.length === 0) return [];
  const raw = await runQuery<Array<Record<string, unknown>>>({
    cadence: GET_MOMENTS_SLICE,
    args: (arg, types) => [
      arg(owner, (types as typeof t).Address),
      arg(
        ids.map((id) => String(id)),
        (types as typeof t).Array((types as typeof t).UInt64),
      ),
    ],
    address: owner,
  });
  return raw.map(normalizeOwnedMoment);
}

function normalizeOwnedMoment(m: Record<string, unknown>): OwnedMoment {
  return {
    source: String(m.source),
    momentID: String(m.momentID),
    playID: Number(m.playID),
    setID: Number(m.setID),
    serialNumber: Number(m.serialNumber),
    setName: (m.setName ?? null) as string | null,
    series: m.series == null ? null : Number(m.series),
    playMetadata:
      (m.playMetadata ?? null) as Record<string, string> | null,
    thumbnail: (m.thumbnail ?? null) as string | null,
    isLocked: Boolean(m.isLocked),
    lockExpiry: m.lockExpiry == null ? null : Number(m.lockExpiry),
  };
}

export interface FetchOptions {
  /** Max total Moments to return across all scanned accounts. */
  limit?: number;
  /** How many Moments to fetch per Cadence call. Defaults to 50. */
  chunkSize?: number;
  /** Optional progress callback: receives (fetched, total). */
  onProgress?: (fetched: number, total: number) => void;
}

/**
 * Primary aggregator: returns every Moment owned by `parent` or any of its
 * Hybrid-Custody child accounts, with metadata already denormalized.
 *
 * Two-phase to survive large collections:
 *   1. Fetch IDs per account (single cheap call each — doesn't borrow NFTs).
 *   2. Fetch metadata in chunks of `chunkSize` via `getMomentsSlice`.
 *
 * Without this split, a single script trying to borrow thousands of Moments
 * hits Cadence's per-script execution-time ceiling and fails.
 */
export async function getAllMomentsForParent(
  parent: string,
  opts: FetchOptions = {},
): Promise<OwnedMoment[]> {
  const chunkSize = opts.chunkSize ?? 50;
  const limit = opts.limit ?? Infinity;

  // Phase 1: enumerate accounts.
  const children = await getLinkedAccounts(parent);
  const addresses = [parent, ...children];

  // Phase 2: fetch IDs per account, building a flat list of {owner, id}.
  const idEntries: Array<{ owner: string; id: string }> = [];
  for (const addr of addresses) {
    if (idEntries.length >= limit) break;
    const ids = await getMomentIds(addr);
    for (const id of ids) {
      idEntries.push({ owner: addr, id });
      if (idEntries.length >= limit) break;
    }
  }

  if (idEntries.length === 0) return [];

  opts.onProgress?.(0, idEntries.length);

  // Phase 3: group by owner, chunk, fetch metadata. runQuery already
  // rate-limits us to 4 concurrent Access Node calls.
  const byOwner = new Map<string, string[]>();
  for (const e of idEntries) {
    const arr = byOwner.get(e.owner) ?? [];
    arr.push(e.id);
    byOwner.set(e.owner, arr);
  }

  const tasks: Array<Promise<OwnedMoment[]>> = [];
  for (const [owner, ownerIds] of byOwner) {
    for (let i = 0; i < ownerIds.length; i += chunkSize) {
      const slice = ownerIds.slice(i, i + chunkSize);
      tasks.push(getMomentsSlice(owner, slice));
    }
  }

  const all: OwnedMoment[] = [];
  let done = 0;
  for (const task of tasks) {
    const chunk = await task;
    all.push(...chunk);
    done += chunk.length;
    opts.onProgress?.(done, idEntries.length);
  }
  return all;
}

// ---------------------------------------------------------------------------
// Lite lock-state slice (delta-scan path)
// ---------------------------------------------------------------------------

export interface LockState {
  momentID: string;
  isLocked: boolean;
  lockExpiry: number | null;
}

/**
 * Returns ONLY the current lock state for `ids` owned by `owner`. Designed
 * to be called with much larger chunks than `getMomentsSlice` because the
 * underlying script doesn't borrow MetadataViews or look up set/play
 * metadata — just reads `TopShotLocking.isLocked` + `getLockExpiry`.
 *
 * Skipped IDs (i.e. owner doesn't actually hold them anymore) are simply
 * absent from the response. Callers should treat that as "removed".
 */
export async function getLockStateSlice(
  owner: string,
  ids: Array<string | number>,
): Promise<LockState[]> {
  if (ids.length === 0) return [];
  const raw = await runQuery<Array<Record<string, unknown>>>({
    cadence: GET_LOCK_STATE_SLICE,
    args: (arg, types) => [
      arg(owner, (types as typeof t).Address),
      arg(
        ids.map((id) => String(id)),
        (types as typeof t).Array((types as typeof t).UInt64),
      ),
    ],
    address: owner,
  });
  return raw.map((m) => ({
    momentID: String(m.momentID),
    isLocked: Boolean(m.isLocked),
    lockExpiry: m.lockExpiry == null ? null : Number(m.lockExpiry),
  }));
}

// ---------------------------------------------------------------------------
// Delta scanner (incremental refresh)
// ---------------------------------------------------------------------------

/**
 * `OwnedMoment` keyed by `momentID`. Used as the "previous snapshot"
 * input to `getDeltaForParent`. Callers typically build this from
 * `owned_moments` rows in Supabase before invoking the delta scan.
 */
export type SnapshotIndex = Map<string, OwnedMoment>;

export interface DeltaProgress {
  /** 'enumerating' | 'metadata' | 'lockstate' */
  phase: "enumerating" | "metadata" | "lockstate";
  /** Number of items processed in the current phase. */
  fetched: number;
  /** Total items expected for the current phase. */
  total: number;
  /** Set once enumeration completes; stable for the rest of the scan. */
  newCount?: number;
  existingCount?: number;
  removedCount?: number;
}

export interface DeltaResult {
  /** Final, complete `OwnedMoment` list after applying the delta. */
  moments: OwnedMoment[];
  /** Moment IDs that existed in `prev` but are no longer owned. */
  removedIds: string[];
  /** Moment IDs that are brand-new (full metadata fetched). */
  newIds: string[];
  /** Moment IDs whose lock state was refreshed but metadata was reused. */
  refreshedIds: string[];
}

export interface DeltaOptions {
  /** Cap total moments scanned. Default: unlimited. */
  limit?: number;
  /** Chunk size for the heavy metadata script. Default: 50 (capped by Cadence). */
  metadataChunkSize?: number;
  /**
   * Chunk size for the cheap lock-state script. Default: 300. Can safely
   * be much larger than the metadata script.
   */
  lockStateChunkSize?: number;
  /** Progress callback fired between phases and chunks. */
  onProgress?: (p: DeltaProgress) => void;
}

/**
 * Incremental scan: returns a fresh `OwnedMoment[]` for `parent` (and its
 * Hybrid-Custody children), reusing cached metadata for IDs already in
 * `prev`. Only refreshes `isLocked`/`lockExpiry` for those — the only
 * fields that change during a Moment's lifetime.
 *
 * Compared to `getAllMomentsForParent` for a 67k user with 100 new
 * Moments since the last verify:
 *   - Old path: ~1340 metadata calls
 *   - New path: ~2 metadata calls + ~225 lock-state calls
 *
 * The lock-state calls are individually ~50× cheaper than metadata calls
 * (no MetadataViews, no set/play metadata lookup). Net effect on a daily
 * re-verify of an existing collector: ~30× faster.
 */
export async function getDeltaForParent(
  parent: string,
  prev: SnapshotIndex,
  opts: DeltaOptions = {},
): Promise<DeltaResult> {
  const metadataChunk = opts.metadataChunkSize ?? 50;
  const lockChunk = opts.lockStateChunkSize ?? 300;
  const limit = opts.limit ?? Infinity;

  // ---- Phase 1: enumerate accounts + IDs (cheap) -------------------------
  opts.onProgress?.({ phase: "enumerating", fetched: 0, total: 0 });

  const children = await getLinkedAccounts(parent);
  const addresses = [parent, ...children];

  // Fan out the per-account ID fetch. These are single getIDs() calls; we
  // can safely parallelize across accounts.
  const idLists = await Promise.all(addresses.map((a) => getMomentIds(a)));
  const idEntries: Array<{ owner: string; id: string }> = [];
  for (let i = 0; i < addresses.length; i++) {
    for (const id of idLists[i]) {
      idEntries.push({ owner: addresses[i], id });
      if (idEntries.length >= limit) break;
    }
    if (idEntries.length >= limit) break;
  }

  // ---- Phase 2: classify into new/existing/removed -----------------------
  const currentIdSet = new Set(idEntries.map((e) => e.id));
  const prevIdSet = new Set(prev.keys());

  const newEntries: Array<{ owner: string; id: string }> = [];
  const existingEntries: Array<{ owner: string; id: string }> = [];
  for (const e of idEntries) {
    if (prevIdSet.has(e.id)) existingEntries.push(e);
    else newEntries.push(e);
  }
  const removedIds: string[] = [];
  for (const id of prev.keys()) {
    if (!currentIdSet.has(id)) removedIds.push(id);
  }

  opts.onProgress?.({
    phase: "enumerating",
    fetched: idEntries.length,
    total: idEntries.length,
    newCount: newEntries.length,
    existingCount: existingEntries.length,
    removedCount: removedIds.length,
  });

  // ---- Phase 3: full metadata fetch for NEW ids only ---------------------
  const newMoments: OwnedMoment[] = [];
  if (newEntries.length > 0) {
    opts.onProgress?.({
      phase: "metadata",
      fetched: 0,
      total: newEntries.length,
      newCount: newEntries.length,
      existingCount: existingEntries.length,
      removedCount: removedIds.length,
    });

    const byOwner = new Map<string, string[]>();
    for (const e of newEntries) {
      const arr = byOwner.get(e.owner) ?? [];
      arr.push(e.id);
      byOwner.set(e.owner, arr);
    }
    const tasks: Array<Promise<OwnedMoment[]>> = [];
    for (const [owner, ownerIds] of byOwner) {
      for (let i = 0; i < ownerIds.length; i += metadataChunk) {
        tasks.push(getMomentsSlice(owner, ownerIds.slice(i, i + metadataChunk)));
      }
    }
    let done = 0;
    for (const t of tasks) {
      const chunk = await t;
      newMoments.push(...chunk);
      done += chunk.length;
      opts.onProgress?.({
        phase: "metadata",
        fetched: done,
        total: newEntries.length,
        newCount: newEntries.length,
        existingCount: existingEntries.length,
        removedCount: removedIds.length,
      });
    }
  }

  // ---- Phase 4: lock-state refresh for EXISTING ids ----------------------
  // Group by owner so each Cadence call is for one account's collection.
  const refreshed: OwnedMoment[] = [];
  const refreshedIds: string[] = [];
  if (existingEntries.length > 0) {
    opts.onProgress?.({
      phase: "lockstate",
      fetched: 0,
      total: existingEntries.length,
      newCount: newEntries.length,
      existingCount: existingEntries.length,
      removedCount: removedIds.length,
    });

    const byOwner = new Map<string, string[]>();
    for (const e of existingEntries) {
      const arr = byOwner.get(e.owner) ?? [];
      arr.push(e.id);
      byOwner.set(e.owner, arr);
    }

    const tasks: Array<Promise<LockState[]>> = [];
    for (const [owner, ownerIds] of byOwner) {
      for (let i = 0; i < ownerIds.length; i += lockChunk) {
        tasks.push(getLockStateSlice(owner, ownerIds.slice(i, i + lockChunk)));
      }
    }
    let done = 0;
    for (const t of tasks) {
      const chunk = await t;
      for (const ls of chunk) {
        const cached = prev.get(ls.momentID);
        if (!cached) continue; // shouldn't happen — we filtered to known ids
        // Reuse all cached metadata; only overlay lock state.
        refreshed.push({
          ...cached,
          isLocked: ls.isLocked,
          lockExpiry: ls.lockExpiry,
        });
        refreshedIds.push(ls.momentID);
      }
      done += chunk.length;
      opts.onProgress?.({
        phase: "lockstate",
        fetched: done,
        total: existingEntries.length,
        newCount: newEntries.length,
        existingCount: existingEntries.length,
        removedCount: removedIds.length,
      });
    }
  }

  return {
    moments: [...refreshed, ...newMoments],
    removedIds,
    newIds: newEntries.map((e) => e.id),
    refreshedIds,
  };
}
