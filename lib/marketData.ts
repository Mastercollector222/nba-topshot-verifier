/**
 * lib/marketData.ts
 * ---------------------------------------------------------------------------
 * Client-side helper for the Portfolio Valuation feature (Feature #7).
 *
 *   - `MarketData` is the per-moment payload returned by `/api/market-data`.
 *   - `useMarketData(momentIds)` is a React hook that POSTs the IDs once
 *     they're known and returns a map keyed by `momentId`.
 *
 * Notes:
 *   - We deliberately keep this *additive* — `OwnedMoment` is not mutated.
 *     The dashboard reads market data through the returned map keyed by
 *     `momentID`, so existing verifier / Cadence / DB code is untouched.
 *   - The hook debounces the fetch by 200ms when `momentIds` changes so a
 *     re-verify that yields the same collection doesn't immediately
 *     re-hit the upstream cache.
 *   - Server caches for 5 min; client also memoizes per-mount, so paging
 *     through the grid never refetches.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef, useState } from "react";

export interface MarketData {
  floorPrice: number | null;
  lastSale: number | null;
  averagePrice: number | null;
  /** Signed % delta of floor vs lifetime average. Positive = trending up. */
  sevenDayChange: number | null;
  listingCount: number | null;
  tier: string | null;
  currency: "USD";
  cachedAt: string;
}

export type MarketDataMap = Record<string, MarketData | null>;

interface State {
  data: MarketDataMap;
  loading: boolean;
  error: string | null;
}

/**
 * Sums the floor price of every moment in `momentIds` for which we have
 * a market entry. Missing entries (null floor or absent in the map) are
 * skipped — we never substitute zeros, since that would understate the
 * portfolio when the upstream is rate-limited or partially unavailable.
 *
 * Returns:
 *   - `total`           — sum of resolved floor prices, USD
 *   - `pricedCount`     — number of moments that contributed a floor price
 *   - `unresolvedCount` — moments missing a price (loading or unpriced)
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

/**
 * Fetches market data for a list of on-chain Moment IDs.
 * Re-fires when the *set* of IDs changes (insertion-order-independent).
 */
export function useMarketData(momentIds: readonly string[] | undefined): State {
  // Stable cache key for the input list — sorted JSON of unique IDs. This
  // way passing the same collection in a different order doesn't refetch.
  const key = useMemo(() => {
    if (!momentIds || momentIds.length === 0) return "";
    return Array.from(new Set(momentIds)).sort().join(",");
  }, [momentIds]);

  const [state, setState] = useState<State>({
    data: {},
    loading: false,
    error: null,
  });
  // Keep a ref of the most recent key so a stale response can't overwrite
  // a newer one if the user paginates / re-verifies quickly.
  const inflightKeyRef = useRef<string>("");

  useEffect(() => {
    if (!key) {
      setState({ data: {}, loading: false, error: null });
      return;
    }
    inflightKeyRef.current = key;
    setState((s) => ({ ...s, loading: true, error: null }));
    let cancelled = false;
    const ids = key.split(",");
    // Debounce slightly so transient renders don't fire two POSTs.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/market-data", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ momentIds: ids }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as { data: MarketDataMap };
        if (cancelled || inflightKeyRef.current !== key) return;
        setState({ data: body.data, loading: false, error: null });
      } catch (e) {
        if (cancelled || inflightKeyRef.current !== key) return;
        setState({
          data: {},
          loading: false,
          error: e instanceof Error ? e.message : "Failed to load market data",
        });
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);

  return state;
}

/**
 * Format a USD price for display. Sub-dollar prices show 2 decimals; >=$1
 * shows 0 decimals to keep tiles compact. Null/NaN renders as an em dash.
 */
export function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1) return `$${value.toFixed(2)}`;
  if (value < 1000) return `$${Math.round(value).toLocaleString()}`;
  if (value < 1_000_000)
    return `$${(Math.round(value / 10) * 10).toLocaleString()}`;
  return `$${(value / 1_000_000).toFixed(1)}M`;
}
