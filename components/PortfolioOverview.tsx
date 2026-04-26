"use client";

/**
 * components/PortfolioOverview.tsx
 * ---------------------------------------------------------------------------
 * Top-of-dashboard summary card for Feature #7 (Portfolio Valuation).
 *
 * Shows:
 *   - Total estimated portfolio value (sum of resolved floor prices, USD).
 *   - Count of priced vs unresolved moments (so users know what's missing).
 *   - Most-valuable moment (highest individual floor) with a deep link.
 *   - Soft loading skeleton while the upstream resolves.
 *
 * The component is purely presentational — it receives moments and a
 * marketData map and never fetches on its own. The dashboard owns the
 * fetch via `useMarketData()`.
 * ---------------------------------------------------------------------------
 */

import type { OwnedMoment } from "@/lib/topshot";
import {
  formatUsd,
  summarizeFloor,
  type MarketDataMap,
} from "@/lib/marketData";

interface Props {
  moments: OwnedMoment[];
  marketData: MarketDataMap;
  loading: boolean;
  error?: string | null;
}

export function PortfolioOverview({
  moments,
  marketData,
  loading,
  error,
}: Props) {
  const ids = moments.map((m) => m.momentID);
  const { total, pricedCount, unresolvedCount } = summarizeFloor(
    ids,
    marketData,
  );

  // Identify the single highest-floor moment so we can spotlight it.
  let topMoment: { m: OwnedMoment; floor: number } | null = null;
  for (const m of moments) {
    const md = marketData[m.momentID];
    if (md?.floorPrice == null) continue;
    if (!topMoment || md.floorPrice > topMoment.floor) {
      topMoment = { m, floor: md.floorPrice };
    }
  }

  const topShotUrl = (id: string) => `https://nbatopshot.com/moment/${id}`;
  const topPlayer =
    topMoment?.m.playMetadata?.["FullName"] ?? topMoment?.m.setName ?? "—";

  return (
    <section className="glass-strong relative flex flex-col gap-5 overflow-hidden rounded-2xl p-6 sm:p-8">
      {/* Decorative blur to match other premium cards on the dashboard. */}
      <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-300/90">
            Portfolio overview
          </span>
          <h2 className="text-3xl font-semibold tracking-tight">
            Estimated value,{" "}
            <span className="text-emerald-300">live.</span>
          </h2>
          <p className="max-w-2xl text-sm text-zinc-300/80">
            Sum of the lowest current ask for every moment you own, sourced
            from NBA Top Shot&apos;s public marketplace. Updates every
            5&nbsp;minutes.
          </p>
        </div>

        {/* Headline number. Skeleton while loading; em dash if upstream
            failed entirely; otherwise the formatted USD total. */}
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Total floor value
          </span>
          {loading && pricedCount === 0 ? (
            <div className="h-10 w-40 animate-pulse rounded-lg bg-white/5" />
          ) : (
            <span
              className="font-mono text-4xl font-semibold tabular-nums text-emerald-200"
              title={`Sum of ${pricedCount.toLocaleString()} resolved floor prices`}
            >
              {error
                ? "—"
                : pricedCount === 0
                  ? "—"
                  : formatUsd(total)}
            </span>
          )}
          <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            USD · {pricedCount.toLocaleString()} priced
            {unresolvedCount > 0 ? (
              <span className="text-zinc-600">
                {" · "}
                {unresolvedCount.toLocaleString()}{" "}
                {loading ? "loading" : "unpriced"}
              </span>
            ) : null}
          </span>
        </div>
      </div>

      {/* Sub-stats row: count + top-floor highlight. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Moments scanned"
          value={moments.length.toLocaleString()}
        />
        <Stat
          label="Editions priced"
          value={pricedCount.toLocaleString()}
          hint={
            unresolvedCount > 0
              ? `${unresolvedCount.toLocaleString()} pending`
              : undefined
          }
        />
        {topMoment ? (
          <a
            href={topShotUrl(topMoment.m.momentID)}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col gap-1 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-left transition hover:border-amber-400/40 hover:bg-white/[0.06]"
          >
            <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 group-hover:text-amber-300">
              Top floor →
            </span>
            <span className="truncate text-sm font-semibold text-zinc-100">
              {topPlayer}
            </span>
            <span className="font-mono text-xs text-emerald-300">
              {formatUsd(topMoment.floor)}{" "}
              <span className="text-zinc-500">
                · #{topMoment.m.serialNumber}
              </span>
            </span>
          </a>
        ) : (
          <Stat label="Top floor" value="—" hint="awaiting prices" />
        )}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2 text-[12px] text-red-300">
          Couldn&apos;t load market data: {error}
        </div>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/5 bg-white/[0.03] p-3">
      <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      <span className="font-mono text-xl font-semibold text-zinc-100">
        {value}
      </span>
      {hint ? (
        <span className="text-[10px] text-zinc-500">{hint}</span>
      ) : null}
    </div>
  );
}
