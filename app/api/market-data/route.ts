/**
 * /api/market-data
 * ---------------------------------------------------------------------------
 * Batch endpoint that returns NBA Top Shot market data keyed by edition
 * (on-chain setID:playID pair). The dashboard dedupes owned moments by
 * edition before calling this, which collapses a 13k-moment collection
 * down to a few hundred actual upstream lookups.
 *
 *   POST /api/market-data
 *   body:  {
 *            editions: Array<{
 *              setID: number | string,       // Cadence UInt32
 *              playID: number | string,      // Cadence UInt32
 *              sampleMomentId: string,       // any owned moment flowId
 *                                            //   in this edition; used to
 *                                            //   resolve GraphQL UUIDs
 *            }>
 *          }
 *   200:   {
 *            data: {
 *              "<setID>:<playID>": {
 *                floorPrice, lastSale, averagePrice, sevenDayChange,
 *                listingCount, tier, currency, cachedAt
 *              } | null
 *            },
 *            generatedAt: string,
 *          }
 *
 * Why per-edition instead of per-moment?
 *   Earlier revisions accepted a flat momentIds[] and resolved each
 *   moment's set/play UUIDs individually. For a whale with 13k moments
 *   that meant ~260 sequential `getMintedMoments` batches — far longer
 *   than Hobby-plan Vercel's 10s function cap. Grouping by edition on
 *   the client drops the upstream call count by 10-50× and lets each
 *   request comfortably finish inside the hard serverless timeout.
 *
 * Caching (module-level Maps — NO Supabase schema changes):
 *   1. `chainToUuid` ("setID:playID" → UUID pair)     — 24h TTL; permanent
 *      in practice because Top Shot's on-chain edition mapping doesn't
 *      change.
 *   2. `marketCache` ("setID:playID" → MarketData)    — 5min TTL.
 *
 * Safety guards:
 *   - Session-gated (no open scraping proxy).
 *   - Max 50 editions per request (fits Hobby 10s timeout comfortably).
 *   - Retry-on-429 with exponential backoff + Retry-After honoring.
 *   - Partial-failure tolerant: individual edition errors return `null`
 *     for that edition rather than 502-ing the whole batch.
 *
 * Strict non-goal: no changes to the verifier, Cadence scripts, or DB.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

// Vercel Hobby caps at 10s; Pro honors up to 60. Setting 60 here is a
// no-op on Hobby but lets Pro users get longer runs. The route is
// *designed* to finish inside 10s with small edition batches, so this
// is belt-and-suspenders only.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UuidPair {
  setUuid: string;
  playUuid: string;
}

export interface MarketData {
  floorPrice: number | null;
  lastSale: number | null;
  averagePrice: number | null;
  /** Signed % delta of floor vs lifetime average. Positive = firming. */
  sevenDayChange: number | null;
  listingCount: number | null;
  tier: string | null;
  currency: "USD";
  cachedAt: string;
}

interface EditionInput {
  setID: number | string;
  playID: number | string;
  sampleMomentId: string;
}

interface CachedUuid {
  value: UuidPair;
  expiresAt: number;
}
interface CachedMarket {
  value: MarketData;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Module-level caches (per-instance on Vercel)
// ---------------------------------------------------------------------------

/** "chainSetID:chainPlayID" → UUID pair (effectively permanent) */
const chainToUuid = new Map<string, CachedUuid>();
/** "chainSetID:chainPlayID" → market data */
const marketCache = new Map<string, CachedMarket>();

const UUID_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MARKET_TTL_MS = 5 * 60 * 1000; // 5min

// Concurrency on outbound upstream calls. With batches of at most 50
// editions, 3 in flight finishes the slowest batch well under 10s.
const MAX_CONCURRENT_UPSTREAM = 3;
const RATE_LIMIT_MAX_RETRIES = 3;

// Max editions per request. Budget math (Hobby 10s cap):
//   25 editions × 2 queries each ÷ concurrency(3) ≈ 17 pair-rounds
//   @ ~400-700ms per round ≈ 7-8s, leaving headroom for the one
//   `getMintedMoments` call and rate-limit retry jitter.
// The client also split-retries any 504, so this is a soft ceiling.
const MAX_EDITIONS_PER_REQUEST = 25;

const ENDPOINT = "https://public-api.nbatopshot.com/graphql";
const USER_AGENT = "nba-challenge-verifier/1.0 (+https://nbatopshot.com)";

// ---------------------------------------------------------------------------
// GraphQL queries (live-verified against Top Shot's public endpoint)
// ---------------------------------------------------------------------------

const QUERY_GET_MINTED_MOMENTS = /* GraphQL */ `
  query GetMintedMoments($ids: [ID!]!) {
    getMintedMoments(input: { momentIds: $ids }) {
      data {
        flowId
        set { id }
        play { id }
      }
    }
  }
`;

const QUERY_GET_EDITION_LISTING = /* GraphQL */ `
  query GetEditionListingCached($setID: ID!, $playID: ID!) {
    getEditionListingCached(input: { setID: $setID, playID: $playID }) {
      data {
        editionListingCount
        priceRange { min max }
        averageSaleData { averagePrice numDays numSales }
        tier
      }
    }
  }
`;

const QUERY_GET_TX_STATS = /* GraphQL */ `
  query GetEditionTxStats($setID: ID!, $playID: ID!) {
    getMarketplaceTransactionEditionStats(
      input: { edition: { setID: $setID, playID: $playID } }
    ) {
      editionStats {
        totalSales
        averageSalePrice
        mostRecentEditionSale { price serialNumber }
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// GraphQL helper with retry-on-429
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": USER_AGENT,
        },
        body: JSON.stringify({ query, variables }),
        // 5s per upstream — short enough that even 3 sequential calls
        // fit comfortably inside the 10s serverless cap.
        signal: AbortSignal.timeout(5_000),
      });
    } catch (e) {
      if (attempt < RATE_LIMIT_MAX_RETRIES) {
        await sleep(200 * 2 ** attempt + Math.floor(Math.random() * 150));
        continue;
      }
      throw e;
    }
    if (res.status === 429) {
      if (attempt >= RATE_LIMIT_MAX_RETRIES) {
        throw new Error("Top Shot GraphQL HTTP 429 (rate limited)");
      }
      const retryAfter = res.headers.get("retry-after");
      const retryMs = retryAfter
        ? Math.min(3_000, Number(retryAfter) * 1000 || 500)
        : 300 * 2 ** attempt + Math.floor(Math.random() * 200);
      await sleep(retryMs);
      continue;
    }
    if (!res.ok) {
      throw new Error(`Top Shot GraphQL HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };
    if (body.errors && body.errors.length > 0) {
      throw new Error(
        `Top Shot GraphQL: ${body.errors.map((e) => e.message).join("; ")}`,
      );
    }
    if (!body.data) throw new Error("Top Shot GraphQL: empty response");
    return body.data;
  }
  throw new Error("Top Shot GraphQL: exhausted retries");
}

// ---------------------------------------------------------------------------
// Resolve on-chain (setID, playID) → GraphQL UUIDs
// ---------------------------------------------------------------------------

interface MintedMomentsResp {
  getMintedMoments: {
    data: Array<{
      flowId: string;
      set: { id: string; flowId: string | null } | null;
      play: { id: string; flowId: string | null } | null;
    }>;
  };
}

async function resolveEditionUuids(
  editions: EditionInput[],
): Promise<Map<string, UuidPair>> {
  const out = new Map<string, UuidPair>();
  const now = Date.now();
  const missesByMoment = new Map<string, string>(); // sampleMomentId → chainKey

  for (const e of editions) {
    const chainKey = `${e.setID}:${e.playID}`;
    const hit = chainToUuid.get(chainKey);
    if (hit && hit.expiresAt > now) {
      out.set(chainKey, hit.value);
    } else {
      missesByMoment.set(e.sampleMomentId, chainKey);
    }
  }
  if (missesByMoment.size === 0) return out;

  // One getMintedMoments call resolves up to 50 sample moment IDs. For
  // edition-batch sizes of 50 this is always a single call.
  const sampleIds = Array.from(missesByMoment.keys());
  try {
    const data = await gql<MintedMomentsResp>(QUERY_GET_MINTED_MOMENTS, {
      ids: sampleIds,
    });
    for (const row of data.getMintedMoments.data ?? []) {
      if (!row.set?.id || !row.play?.id) continue;
      const chainKey = missesByMoment.get(row.flowId);
      if (!chainKey) continue;
      const pair: UuidPair = {
        setUuid: row.set.id,
        playUuid: row.play.id,
      };
      chainToUuid.set(chainKey, { value: pair, expiresAt: now + UUID_TTL_MS });
      out.set(chainKey, pair);
    }
  } catch {
    // Swallow: unresolved editions simply return `null` in the response.
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fetch market data for a single edition
// ---------------------------------------------------------------------------

interface ListingResp {
  getEditionListingCached: {
    data: {
      editionListingCount: number | null;
      priceRange: { min: string | null; max: string | null } | null;
      averageSaleData: {
        averagePrice: string | null;
        numDays: number | null;
        numSales: number | null;
      } | null;
      tier: string | null;
    } | null;
  };
}
interface TxStatsResp {
  getMarketplaceTransactionEditionStats: {
    editionStats: {
      totalSales: number | null;
      averageSalePrice: string | null;
      mostRecentEditionSale: {
        price: string | null;
        serialNumber: number | null;
      } | null;
    } | null;
  };
}

function num(s: string | null | undefined): number | null {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function fetchMarketForEdition(pair: UuidPair): Promise<MarketData> {
  const [listing, stats] = await Promise.allSettled([
    gql<ListingResp>(QUERY_GET_EDITION_LISTING, {
      setID: pair.setUuid,
      playID: pair.playUuid,
    }),
    gql<TxStatsResp>(QUERY_GET_TX_STATS, {
      setID: pair.setUuid,
      playID: pair.playUuid,
    }),
  ]);

  const listingData =
    listing.status === "fulfilled"
      ? listing.value.getEditionListingCached.data
      : null;
  const statsData =
    stats.status === "fulfilled"
      ? stats.value.getMarketplaceTransactionEditionStats.editionStats
      : null;

  const floorPrice = num(listingData?.priceRange?.min ?? null);
  const lastSale = num(statsData?.mostRecentEditionSale?.price ?? null);
  const averagePrice =
    num(statsData?.averageSalePrice ?? null) ??
    num(listingData?.averageSaleData?.averagePrice ?? null);

  let sevenDayChange: number | null = null;
  if (floorPrice != null && averagePrice != null && averagePrice > 0) {
    sevenDayChange = ((floorPrice - averagePrice) / averagePrice) * 100;
  }

  return {
    floorPrice,
    lastSale,
    averagePrice,
    sevenDayChange,
    listingCount: listingData?.editionListingCount ?? null,
    tier: listingData?.tier ?? null,
    currency: "USD",
    cachedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Fan out market-data fetches across editions with bounded concurrency
// ---------------------------------------------------------------------------

async function getMarketDataForEditions(
  editionsWithPairs: Array<{ chainKey: string; pair: UuidPair }>,
): Promise<Map<string, MarketData>> {
  const now = Date.now();
  const out = new Map<string, MarketData>();
  const todo: Array<{ chainKey: string; pair: UuidPair }> = [];

  for (const e of editionsWithPairs) {
    const hit = marketCache.get(e.chainKey);
    if (hit && hit.expiresAt > now) {
      out.set(e.chainKey, hit.value);
    } else {
      todo.push(e);
    }
  }

  let cursor = 0;
  async function worker() {
    while (cursor < todo.length) {
      const { chainKey, pair } = todo[cursor++];
      try {
        const md = await fetchMarketForEdition(pair);
        marketCache.set(chainKey, { value: md, expiresAt: now + MARKET_TTL_MS });
        out.set(chainKey, md);
      } catch {
        // Skip — this edition returns null to the client.
      }
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(MAX_CONCURRENT_UPSTREAM, todo.length) },
      worker,
    ),
  );
  return out;
}

// ---------------------------------------------------------------------------
// Supabase L2 cache — shared across all users and serverless instances.
//   Editions are public data; sharing the cache means one user's first
//   fetch warms it for everyone. A 13k-moment portfolio that takes ~2min
//   on first load resolves in <1s on subsequent visits (or for any other
//   user owning overlapping editions).
// ---------------------------------------------------------------------------

interface DbCacheRow {
  chain_set_id: number;
  chain_play_id: number;
  set_uuid: string | null;
  play_uuid: string | null;
  floor_price: number | null;
  last_sale: number | null;
  average_price: number | null;
  seven_day_change: number | null;
  listing_count: number | null;
  tier: string | null;
  cached_at: string;
}

/**
 * Read every edition row from Supabase that matches the requested set
 * of (chainSetID, chainPlayID) pairs. Splits the IN-list into chunks
 * because Postgres has a hard limit on parameter count for `IN`.
 *
 * Returns:
 *   - `fresh` — rows whose cached_at is within MARKET_TTL_MS; we return
 *     these straight to the client without touching upstream.
 *   - `stale` — rows older than the TTL; we keep their UUIDs (saves a
 *     `getMintedMoments` call) but refresh the price columns.
 *   - `unknown` — chainKeys with no row at all; full upstream lookup.
 */
async function readDbCache(
  editions: EditionInput[],
): Promise<{
  fresh: Map<string, MarketData>;
  knownUuids: Map<string, UuidPair>; // includes both fresh AND stale
}> {
  const fresh = new Map<string, MarketData>();
  const knownUuids = new Map<string, UuidPair>();
  if (editions.length === 0) return { fresh, knownUuids };

  // OR-of-AND list: (chain_set_id, chain_play_id) pairs. We use a
  // composite filter via .or() because Supabase's `.in()` doesn't
  // support composite-key tuples directly.
  const sb = supabaseAdmin();
  const fiveMinutesAgo = new Date(Date.now() - MARKET_TTL_MS).toISOString();

  // Build chunks — keep filter strings short to avoid hitting URL
  // length caps. 25 editions per query is well under any limit.
  const CHUNK = 25;
  const now = Date.now();
  for (let i = 0; i < editions.length; i += CHUNK) {
    const slice = editions.slice(i, i + CHUNK);
    const orFilter = slice
      .map(
        (e) => `and(chain_set_id.eq.${e.setID},chain_play_id.eq.${e.playID})`,
      )
      .join(",");
    try {
      const { data, error } = await sb
        .from("market_data_cache")
        .select<"*", DbCacheRow>("*")
        .or(orFilter);
      if (error || !data) continue;
      for (const row of data) {
        const chainKey = `${row.chain_set_id}:${row.chain_play_id}`;
        // Always remember UUIDs — they're immutable and save us a
        // round-trip whether the price half is fresh or stale.
        if (row.set_uuid && row.play_uuid) {
          const pair: UuidPair = {
            setUuid: row.set_uuid,
            playUuid: row.play_uuid,
          };
          knownUuids.set(chainKey, pair);
          // Also warm the in-memory L1 cache for the next request.
          chainToUuid.set(chainKey, {
            value: pair,
            expiresAt: now + UUID_TTL_MS,
          });
        }
        const isFresh =
          new Date(row.cached_at).getTime() >= Date.now() - MARKET_TTL_MS;
        if (isFresh) {
          const md: MarketData = {
            floorPrice: row.floor_price,
            lastSale: row.last_sale,
            averagePrice: row.average_price,
            sevenDayChange: row.seven_day_change,
            listingCount: row.listing_count,
            tier: row.tier,
            currency: "USD",
            cachedAt: row.cached_at,
          };
          fresh.set(chainKey, md);
          // Warm L1 too so other concurrent requests on this instance
          // get the in-memory hit path.
          marketCache.set(chainKey, {
            value: md,
            expiresAt:
              new Date(row.cached_at).getTime() + MARKET_TTL_MS,
          });
        }
      }
    } catch {
      // Cache outage shouldn't break the route; fall through to upstream.
      void fiveMinutesAgo; // (kept reference; PostgREST query above is the actual filter source)
    }
  }
  return { fresh, knownUuids };
}

/**
 * Persist fresh market data + (when known) the UUID mapping. Fire and
 * forget — we don't await the upsert in the request path because the
 * client doesn't need it to render and a slow DB shouldn't slow the
 * response. Errors are swallowed silently.
 */
async function writeDbCache(
  rows: Array<{
    chainSetId: string | number;
    chainPlayId: string | number;
    pair?: UuidPair;
    md: MarketData;
  }>,
) {
  if (rows.length === 0) return;
  try {
    const sb = supabaseAdmin();
    const payload: DbCacheRow[] = rows.map((r) => ({
      chain_set_id: Number(r.chainSetId),
      chain_play_id: Number(r.chainPlayId),
      set_uuid: r.pair?.setUuid ?? null,
      play_uuid: r.pair?.playUuid ?? null,
      floor_price: r.md.floorPrice,
      last_sale: r.md.lastSale,
      average_price: r.md.averagePrice,
      seven_day_change: r.md.sevenDayChange,
      listing_count: r.md.listingCount,
      tier: r.md.tier,
      cached_at: r.md.cachedAt,
    }));
    await sb
      .from("market_data_cache")
      .upsert(payload, { onConflict: "chain_set_id,chain_play_id" });
  } catch {
    // Swallow. Cache write failure must not affect the user response.
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawEditions = (body as { editions?: unknown })?.editions;
  if (!Array.isArray(rawEditions)) {
    return NextResponse.json(
      { error: "editions must be an array" },
      { status: 400 },
    );
  }

  // Validate + dedupe by chainKey (in case the client didn't).
  const byKey = new Map<string, EditionInput>();
  for (const raw of rawEditions) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const setID = e.setID;
    const playID = e.playID;
    const sampleMomentId = e.sampleMomentId;
    if (
      (typeof setID !== "number" && typeof setID !== "string") ||
      (typeof playID !== "number" && typeof playID !== "string") ||
      typeof sampleMomentId !== "string"
    ) {
      continue;
    }
    if (!/^[0-9]+$/.test(String(setID))) continue;
    if (!/^[0-9]+$/.test(String(playID))) continue;
    if (!/^[0-9]+$/.test(sampleMomentId)) continue;
    const key = `${setID}:${playID}`;
    if (!byKey.has(key)) {
      byKey.set(key, { setID, playID, sampleMomentId });
    }
  }

  if (byKey.size === 0) {
    return NextResponse.json({
      data: {},
      generatedAt: new Date().toISOString(),
    });
  }
  if (byKey.size > MAX_EDITIONS_PER_REQUEST) {
    return NextResponse.json(
      {
        error: `Too many editions (max ${MAX_EDITIONS_PER_REQUEST} per call)`,
      },
      { status: 400 },
    );
  }

  const editions = Array.from(byKey.values());

  // ---- L2: Supabase shared cache ----
  // First, see what's already in the DB. Fresh rows (≤5min old) skip
  // upstream entirely; stale rows still hand us their UUIDs so we
  // avoid the expensive `getMintedMoments` call when refreshing.
  const { fresh: dbFresh, knownUuids: dbUuids } = await readDbCache(editions);

  // Editions whose UUIDs we already know (from DB or in-memory L1).
  // We pre-seed `chainToUuid` so `resolveEditionUuids` skips them.
  const editionsNeedingUpstream = editions.filter(
    (e) => !dbFresh.has(`${e.setID}:${e.playID}`),
  );

  // Step 1: resolve on-chain → UUID for editions we haven't seen
  // (DB-known UUIDs were already warmed into `chainToUuid` by readDbCache).
  const uuidMap = await resolveEditionUuids(editionsNeedingUpstream);
  // Merge any UUIDs we already had from DB into the working map.
  for (const [k, v] of dbUuids) if (!uuidMap.has(k)) uuidMap.set(k, v);

  // Step 2: fetch market data for editions that aren't fresh in the DB.
  const withPairs: Array<{ chainKey: string; pair: UuidPair }> = [];
  for (const e of editionsNeedingUpstream) {
    const key = `${e.setID}:${e.playID}`;
    const pair = uuidMap.get(key);
    if (pair) withPairs.push({ chainKey: key, pair });
  }
  const upstreamMap = await getMarketDataForEditions(withPairs);

  // ---- L2: write fresh upstream results back to Supabase ----
  // Fire-and-forget so the upsert doesn't add latency to the response.
  const writes: Array<{
    chainSetId: string | number;
    chainPlayId: string | number;
    pair?: UuidPair;
    md: MarketData;
  }> = [];
  for (const e of editionsNeedingUpstream) {
    const key = `${e.setID}:${e.playID}`;
    const md = upstreamMap.get(key);
    if (md) {
      writes.push({
        chainSetId: e.setID,
        chainPlayId: e.playID,
        pair: uuidMap.get(key),
        md,
      });
    }
  }
  // Don't await — let the DB write happen in the background.
  void writeDbCache(writes);

  // Assemble response keyed by chainKey (client re-expands to momentIDs).
  // DB-fresh entries take precedence over upstream because they're
  // already authoritative, but in practice they don't overlap.
  const out: Record<string, MarketData | null> = {};
  for (const e of editions) {
    const key = `${e.setID}:${e.playID}`;
    out[key] =
      dbFresh.get(key) ?? upstreamMap.get(key) ?? null;
  }

  return NextResponse.json(
    { data: out, generatedAt: new Date().toISOString() },
    { headers: { "cache-control": "private, max-age=60" } },
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST { editions: [{setID, playID, sampleMomentId}, ...] }",
  });
}
