/**
 * lib/marketData.ts
 * ---------------------------------------------------------------------------
 * Client-side helper for the Portfolio Valuation feature (Feature #7).
 *
 * Architecture:
 *   - The dashboard owns a list of `OwnedMoment`s (each with `setID` and
 *     `playID`). We dedupe those into UNIQUE EDITIONS and POST batches
 *     of 50 editions to `/api/market-data`. The server returns market
 *     data keyed by `"setID:playID"` — we then expand back out to a
 *     `momentID → MarketData` map for the rest of the UI.
 *
 *   - This is the critical optimization that makes 13k-moment portfolios
 *     work on Vercel Hobby (10s function cap): a whale's 13k moments
 *     usually map to only a few hundred unique editions, which fits
 *     comfortably inside the timeout budget.
 *
 * Public API:
 *   - `MarketData`            — per-edition payload type.
 *   - `MarketDataMap`         — `Record<momentID, MarketData | null>`.
 *   - `useMarketData(moments)`— React hook taking owned moments and
 *                               returning the expanded momentID map.
 *   - `summarizeFloor()`      — sum + count helper for the overview card.
 *   - `formatUsd()`           — display formatter.
 *
 * Implementation notes:
 *   - The hook debounces by 200ms so transient re-renders don't fire
 *     duplicate POSTs.
 *   - We update state progressively as each edition-batch lands so the
 *     portfolio total ticks up live for huge collections.
 *   - Re-keying on the deduped edition signature (not raw momentIds)
 *     means re-verifies that surface the same editions don't refetch.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef, useState } from "react";

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

/** Keyed by on-chain `momentID`. */
export type MarketDataMap = Record<string, MarketData | null>;

/** Subset of `OwnedMoment` that this module needs. Kept narrow so we
 *  don't pull a heavy dep on the full type. */
export interface MomentRef {
  momentID: string;
  setID: number | string;
  playID: number | string;
}

interface State {
  data: MarketDataMap;
  loading: boolean;
  error: string | null;
}

/**
 * Sums the floor price of every moment in `momentIds` for which we have
 * a market entry. Missing entries are skipped (we never substitute zero,
 * which would understate the portfolio during partial loads).
 */
export function summarizeFloor(
  momentIds: readonly string[],
  data: MarketDataMap,
): { total: number; pricedCount: number; unresolvedCount: number } {
  let total = 0;
  let pricedCount = 0;
  for (const id of momentIds) {
    const md = data[id];
    if (md && typeof md.floorPrice === "number") {
      total += md.floorPrice;
      pricedCount += 1;
    }
  }
  return {
    total,
    pricedCount,
    unresolvedCount: momentIds.length - pricedCount,
  };
}

interface EditionBucket {
  chainKey: string; // "<setID>:<playID>"
  setID: number | string;
  playID: number | string;
  sampleMomentId: string;
  /** Every owned momentID in this edition. */
  momentIds: string[];
}

/**
 * Fetches market data for every owned moment by deduping into editions,
 * paging through the server in batches of 50, and expanding the result
 * back to a momentID-keyed map.
 */
export function useMarketData(moments: readonly MomentRef[] | undefined): State {
  // Group moments by edition. Order-independent stable signature so the
  // hook doesn't refetch when the user re-verifies the same collection.
  const buckets = useMemo<EditionBucket[]>(() => {
    if (!moments || moments.length === 0) return [];
    const map = new Map<string, EditionBucket>();
    for (const m of moments) {
      const chainKey = `${m.setID}:${m.playID}`;
      const existing = map.get(chainKey);
      if (existing) {
        existing.momentIds.push(m.momentID);
      } else {
        map.set(chainKey, {
          chainKey,
          setID: m.setID,
          playID: m.playID,
          sampleMomentId: m.momentID,
          momentIds: [m.momentID],
        });
      }
    }
    return Array.from(map.values());
  }, [moments]);

  // Stable cache key for the deduped edition set.
  const key = useMemo(() => {
    if (buckets.length === 0) return "";
    return buckets
      .map((b) => b.chainKey)
      .sort()
      .join("|");
  }, [buckets]);

  const [state, setState] = useState<State>({
    data: {},
    loading: false,
    error: null,
  });
  const inflightKeyRef = useRef<string>("");

  useEffect(() => {
    if (!key) {
      setState({ data: {}, loading: false, error: null });
      return;
    }
    inflightKeyRef.current = key;
    setState((s) => ({ ...s, loading: true, error: null }));
    let cancelled = false;

    // Server caps each request at 50 editions to fit Hobby's 10s
    // serverless timeout. Two parallel chunks halves wall time without
    // hammering Top Shot's rate limit.
    const EDITIONS_PER_REQUEST = 50;
    const PARALLEL = 2;

    const editionChunks: EditionBucket[][] = [];
    for (let i = 0; i < buckets.length; i += EDITIONS_PER_REQUEST) {
      editionChunks.push(buckets.slice(i, i + EDITIONS_PER_REQUEST));
    }

    const merged: MarketDataMap = {};

    /** Expand a per-edition response into the per-momentID map. */
    function fanOut(
      chunk: EditionBucket[],
      perEdition: Record<string, MarketData | null>,
    ) {
      for (const bucket of chunk) {
        const md = perEdition[bucket.chainKey] ?? null;
        for (const id of bucket.momentIds) {
          merged[id] = md;
        }
      }
    }

    const timer = setTimeout(async () => {
      try {
        for (let i = 0; i < editionChunks.length; i += PARALLEL) {
          const slice = editionChunks.slice(i, i + PARALLEL);
          const results = await Promise.all(
            slice.map(async (chunk) => {
              const res = await fetch("/api/market-data", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  editions: chunk.map((b) => ({
                    setID: b.setID,
                    playID: b.playID,
                    sampleMomentId: b.sampleMomentId,
                  })),
                }),
              });
              if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as {
                  error?: string;
                };
                throw new Error(body.error ?? `HTTP ${res.status}`);
              }
              return {
                chunk,
                body: (await res.json()) as {
                  data: Record<string, MarketData | null>;
                },
              };
            }),
          );
          if (cancelled || inflightKeyRef.current !== key) return;
          for (const r of results) fanOut(r.chunk, r.body.data);
          // Progressive update — portfolio value climbs as chunks land.
          setState({
            data: { ...merged },
            loading: i + PARALLEL < editionChunks.length,
            error: null,
          });
        }
        if (cancelled || inflightKeyRef.current !== key) return;
        setState({ data: merged, loading: false, error: null });
      } catch (e) {
        if (cancelled || inflightKeyRef.current !== key) return;
        // Keep whatever we did manage to load — surface the error
        // banner but don't blank the existing prices.
        setState({
          data: merged,
          loading: false,
          error: e instanceof Error ? e.message : "Failed to load market data",
        });
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, buckets]);

  return state;
}

/**
 * Format a USD price for display. Sub-dollar prices show 2 decimals;
 * >= $1 shows 0 decimals to keep tiles compact. Null/NaN renders as
 * an em dash.
 */
export function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1) return `$${value.toFixed(2)}`;
  if (value < 1000) return `$${Math.round(value).toLocaleString()}`;
  if (value < 1_000_000)
    return `$${(Math.round(value / 10) * 10).toLocaleString()}`;
  return `$${(value / 1_000_000).toFixed(1)}M`;
}
