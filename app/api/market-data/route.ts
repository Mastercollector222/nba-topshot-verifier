/**
 * /api/market-data
 * ---------------------------------------------------------------------------
 * Batch endpoint that returns NBA Top Shot market data for a list of owned
 * Moments. Used by the dashboard's Portfolio Overview card and the per-moment
 * floor-price badge.
 *
 *   POST /api/market-data
 *   body:  { momentIds: string[] }   // on-chain Cadence UInt64s, as strings
 *   200:   {
 *            data: {
 *              [momentId]: {
 *                floorPrice:     number | null,  // lowest current ask, USD
 *                lastSale:       number | null,  // most recent P2P sale, USD
 *                averagePrice:   number | null,  // rolling average sale, USD
 *                sevenDayChange: number | null,  // % delta floor vs avg
 *                listingCount:   number | null,  // # of active listings
 *                tier:           string | null,  // MOMENT_TIER_COMMON, etc.
 *                currency:       "USD",
 *                cachedAt:       string,         // ISO ts of upstream fetch
 *              }
 *            },
 *            generatedAt: string,
 *          }
 *
 * Why two upstream queries:
 *   - `getEditionListingCached(setID, playID)` → floor + listing count + tier
 *   - `getMarketplaceTransactionEditionStats({ edition })` → last sale + avg
 *
 * Why two CACHE LAYERS:
 *   1. flowMomentId → { setUuid, playUuid }   (24h TTL — plays don't change)
 *   2. setUuid:playUuid → marketData           (5m TTL — prices fluctuate)
 *
 * Both caches are module-level Maps. Per the "no schema changes" rule we
 * intentionally avoid a Supabase table here. On Vercel each serverless
 * instance keeps its own cache; cold starts re-warm naturally.
 *
 * Auth: session-gated so this endpoint can't be used as an open scraping
 * proxy against Top Shot's free GraphQL.
 *
 * Strict non-goal: this route does NOT mutate `OwnedMoment`, the verifier,
 * or any Cadence script. It is purely additive over the existing pipeline.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { getSessionAddress } from "@/lib/admin";

// Allow up to 60s per request — whales with thousands of moments need
// time to walk every chunk's upstream calls (with rate-limit retries).
// Vercel's default of 10s would otherwise truncate large requests
// mid-flight. Raised to the Pro-plan max so Hobby installs simply
// cap at the lower bound automatically.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UuidPair {
  setUuid: string;
  playUuid: string;
  tier: string | null;
}

export interface MarketData {
  floorPrice: number | null;
  lastSale: number | null;
  averagePrice: number | null;
  sevenDayChange: number | null;
  listingCount: number | null;
  tier: string | null;
  currency: "USD";
  cachedAt: string;
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
// Module-level caches. Per-instance on Vercel; that's fine for our scale.
// ---------------------------------------------------------------------------

/** flowMomentId → { setUuid, playUuid, tier } */
const uuidCache = new Map<string, CachedUuid>();
/** "setUuid:playUuid" → market data */
const marketCache = new Map<string, CachedMarket>();

const UUID_TTL_MS = 24 * 60 * 60 * 1000; // 24h — plays/sets are immutable
const MARKET_TTL_MS = 5 * 60 * 1000; // 5m — prices change

// Concurrency cap on outbound GraphQL calls. Top Shot's public API
// returns HTTP 429 when too many requests land at once; 3 has held up
// under whale-collection (~5k moment) testing without rate-limiting.
const MAX_CONCURRENT_UPSTREAM = 3;
// Max retries for a 429 response. We honor `Retry-After` when present,
// otherwise back off exponentially with a small jitter.
const RATE_LIMIT_MAX_RETRIES = 4;

const ENDPOINT = "https://public-api.nbatopshot.com/graphql";
const USER_AGENT = "nba-challenge-verifier/1.0 (+https://nbatopshot.com)";

// ---------------------------------------------------------------------------
// GraphQL queries (verified live against Top Shot's public-api endpoint)
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
// GraphQL helper
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  let lastErr: unknown = null;
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
        // Keep the route snappy even when upstream stalls. 8s gives plenty
        // of headroom for the slowest sequential edition lookup.
        signal: AbortSignal.timeout(8_000),
      });
    } catch (e) {
      // Network error / abort — try again with backoff.
      lastErr = e;
      if (attempt < RATE_LIMIT_MAX_RETRIES) {
        await sleep(250 * 2 ** attempt + Math.floor(Math.random() * 200));
        continue;
      }
      throw e;
    }

    // Rate limited — honor Retry-After if present, else exponential
    // backoff with jitter. Capped retries so a wedged upstream can't
    // stall the request forever.
    if (res.status === 429) {
      if (attempt >= RATE_LIMIT_MAX_RETRIES) {
        throw new Error("Top Shot GraphQL HTTP 429 (rate limited)");
      }
      const retryAfter = res.headers.get("retry-after");
      const retryMs = retryAfter
        ? Math.min(5_000, Number(retryAfter) * 1000 || 1_000)
        : 400 * 2 ** attempt + Math.floor(Math.random() * 250);
      await sleep(retryMs);
      continue;
    }

    if (!res.ok) {
      // Other HTTP errors aren't worth retrying — fail fast.
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
  throw lastErr ?? new Error("Top Shot GraphQL: exhausted retries");
}

// ---------------------------------------------------------------------------
// Step 1 — resolve flow moment IDs → set/play UUIDs (cached 24h)
// ---------------------------------------------------------------------------

interface MintedMomentsResp {
  getMintedMoments: {
    data: Array<{
      flowId: string;
      set: { id: string } | null;
      play: { id: string } | null;
    }>;
  };
}

async function resolveUuids(
  flowMomentIds: string[],
): Promise<Map<string, UuidPair>> {
  const out = new Map<string, UuidPair>();
  const now = Date.now();
  const misses: string[] = [];
  for (const id of flowMomentIds) {
    const hit = uuidCache.get(id);
    if (hit && hit.expiresAt > now) {
      out.set(id, hit.value);
    } else {
      misses.push(id);
    }
  }
  if (misses.length === 0) return out;

  // Top Shot allows batched lookups; we batch in groups of 50 to keep
  // each request small. Run them sequentially so we don't pile up
  // concurrent calls against a sometimes-rate-limited public API.
  // Individual batch failures are *swallowed* — better to render market
  // data for the moments we did resolve than to 502 the whole portfolio.
  const BATCH = 50;
  for (let i = 0; i < misses.length; i += BATCH) {
    const slice = misses.slice(i, i + BATCH);
    try {
      const data = await gql<MintedMomentsResp>(QUERY_GET_MINTED_MOMENTS, {
        ids: slice,
      });
      for (const row of data.getMintedMoments.data ?? []) {
        if (!row.set?.id || !row.play?.id) continue;
        const pair: UuidPair = {
          setUuid: row.set.id,
          playUuid: row.play.id,
          tier: null,
        };
        uuidCache.set(row.flowId, {
          value: pair,
          expiresAt: now + UUID_TTL_MS,
        });
        out.set(row.flowId, pair);
      }
    } catch {
      // Skip this batch; the unresolved moments will simply render
      // without market data this cycle and re-attempt on next refresh.
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Step 2 — fetch market data per unique (setUuid, playUuid) pair (5m cache)
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

async function fetchMarketForPair(pair: UuidPair): Promise<MarketData> {
  // Fire both queries in parallel; if one fails we still return what we have.
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
    listing.status === "fulfilled" ? listing.value.getEditionListingCached.data : null;
  const statsData =
    stats.status === "fulfilled"
      ? stats.value.getMarketplaceTransactionEditionStats.editionStats
      : null;

  const floorPrice = num(listingData?.priceRange?.min ?? null);
  const lastSale = num(statsData?.mostRecentEditionSale?.price ?? null);
  // Prefer the longer-range avg from txStats (lifetime), fall back to
  // editionListing's rolling avg if txStats is missing.
  const averagePrice =
    num(statsData?.averageSalePrice ?? null) ??
    num(listingData?.averageSaleData?.averagePrice ?? null);

  // "7-day change" approximation: signed % delta of floor vs rolling
  // average. Positive = floor is above the recent average (trending up),
  // negative = floor below average (trending down). True 7-day window
  // isn't exposed by the public API, so this is the best signal without
  // scraping historic transactions per moment.
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
    tier: listingData?.tier ?? pair.tier,
    currency: "USD",
    cachedAt: new Date().toISOString(),
  };
}

async function getMarketDataForPairs(
  pairs: UuidPair[],
): Promise<Map<string, MarketData>> {
  const now = Date.now();
  const out = new Map<string, MarketData>();
  const todo: UuidPair[] = [];

  // De-dupe by key first — many moments share an edition.
  const uniqByKey = new Map<string, UuidPair>();
  for (const p of pairs) uniqByKey.set(`${p.setUuid}:${p.playUuid}`, p);

  for (const [key, pair] of uniqByKey) {
    const hit = marketCache.get(key);
    if (hit && hit.expiresAt > now) {
      out.set(key, hit.value);
    } else {
      todo.push(pair);
    }
  }

  // Bounded concurrency over the work list.
  let cursor = 0;
  async function worker() {
    while (cursor < todo.length) {
      const pair = todo[cursor++];
      const key = `${pair.setUuid}:${pair.playUuid}`;
      try {
        const md = await fetchMarketForPair(pair);
        marketCache.set(key, { value: md, expiresAt: now + MARKET_TTL_MS });
        out.set(key, md);
      } catch {
        // Don't blow up the whole batch over one edition. The client
        // simply gets a `null` entry for this moment and renders "—".
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT_UPSTREAM, todo.length) }, worker),
  );
  return out;
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
  const raw = (body as { momentIds?: unknown })?.momentIds;
  if (!Array.isArray(raw)) {
    return NextResponse.json(
      { error: "momentIds must be an array of strings" },
      { status: 400 },
    );
  }
  const momentIds = Array.from(
    new Set(
      raw
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter((v): v is string => v.length > 0 && /^[0-9]+$/.test(v)),
    ),
  );
  // Cap input size to keep the response bounded; in practice users
  // rarely own > 1000 moments.
  if (momentIds.length === 0) {
    return NextResponse.json({ data: {}, generatedAt: new Date().toISOString() });
  }
  if (momentIds.length > 2000) {
    return NextResponse.json(
      { error: "Too many momentIds (max 2000 per call)" },
      { status: 400 },
    );
  }

  // `resolveUuids` is partial-tolerant — it never throws; missing
  // moments simply won't have entries in the returned map and the
  // client renders them without a price chip until next refresh.
  const uuidByMoment = await resolveUuids(momentIds);

  const dataByPair = await getMarketDataForPairs(
    Array.from(uuidByMoment.values()),
  );

  const out: Record<string, MarketData | null> = {};
  for (const id of momentIds) {
    const pair = uuidByMoment.get(id);
    if (!pair) {
      out[id] = null;
      continue;
    }
    out[id] = dataByPair.get(`${pair.setUuid}:${pair.playUuid}`) ?? null;
  }

  return NextResponse.json(
    { data: out, generatedAt: new Date().toISOString() },
    {
      headers: {
        // Browser-side cache for a minute so quick navigations don't
        // re-trigger a server refetch. CDN cache disabled because the
        // body depends on the user's owned moments list.
        "cache-control": "private, max-age=60",
      },
    },
  );
}

// Allow GET for a quick smoke check without a body.
export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST { momentIds: string[] } to fetch market data",
  });
}
