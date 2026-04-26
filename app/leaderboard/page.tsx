"use client";

/**
 * app/leaderboard/page.tsx
 * ---------------------------------------------------------------------------
 * Public ranking of users by number of completed reward rules ("challenges
 * completed"). Renders a premium dark table that mirrors the dashboard
 * aesthetic. Data comes from `/api/leaderboard` which already aggregates
 * + sorts server-side.
 *
 * Privacy: only Flow addresses + counts are exposed (no Moment IDs, no
 * PII). The address is shortened in the UI; full address shown on hover.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState } from "react";

import { SiteHeader } from "@/components/SiteHeader";

interface Entry {
  address: string;
  /** NBA Top Shot username from the user's claim form, when present. */
  username: string | null;
  completed: number;
  lastEarnedAt: string;
}

interface LeaderboardResponse {
  entries: Entry[];
  totalRules: number;
  generatedAt: string;
}

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function rankAccent(rank: number): string {
  if (rank === 0)
    return "bg-gradient-to-br from-amber-300 to-amber-600 text-black";
  if (rank === 1)
    return "bg-gradient-to-br from-zinc-200 to-zinc-400 text-black";
  if (rank === 2)
    return "bg-gradient-to-br from-orange-700 to-amber-900 text-amber-100";
  return "bg-white/5 text-zinc-300 border border-white/10";
}

export default function LeaderboardPage() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/leaderboard?limit=100", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as LeaderboardResponse;
        if (!cancelled) setData(body);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load leaderboard");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader subtitle="Leaderboard" />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
        <section className="glass-strong relative flex flex-col gap-3 overflow-hidden rounded-2xl p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-amber-400/15 blur-3xl" />
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-amber-300/90">
            Hall of Fame
          </span>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Top collectors,{" "}
            <span className="text-gold">ranked.</span>
          </h1>
          <p className="max-w-2xl text-sm text-zinc-300/80">
            Who&apos;s completed the most active challenges? Connect your
            wallet, scan your collection, and your address joins the board
            with every reward you earn.
          </p>
          {data ? (
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              {data.entries.length.toLocaleString()} collectors ·{" "}
              {data.totalRules.toLocaleString()} active challenges · updated{" "}
              <span className="text-zinc-300">
                {new Date(data.generatedAt).toLocaleString()}
              </span>
            </p>
          ) : null}
        </section>

        {loading ? (
          <div className="glass flex items-center justify-center rounded-2xl p-16">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 rounded-full border-2 border-white/10" />
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-amber-400" />
            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-300">
            {error}
          </div>
        ) : !data || data.entries.length === 0 ? (
          <div className="glass rounded-2xl py-16 text-center text-sm text-zinc-400">
            Nobody has completed a challenge yet. Be the first.
          </div>
        ) : (
          <div className="glass overflow-hidden rounded-2xl">
            {/* Header row */}
            <div className="grid grid-cols-[64px_1fr_auto_auto] items-center gap-4 border-b border-white/5 px-5 py-3 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
              <span>Rank</span>
              <span>Top Shot Collector</span>
              <span className="text-right">Completed</span>
              <span className="hidden sm:inline">Last earned</span>
            </div>
            <ul className="divide-y divide-white/5">
              {data.entries.map((e, i) => (
                <li
                  key={e.address}
                  className="grid grid-cols-[64px_1fr_auto_auto] items-center gap-4 px-5 py-4 transition hover:bg-white/[0.02]"
                >
                  {/* Rank medallion */}
                  <span
                    className={
                      "flex h-9 w-9 items-center justify-center rounded-full font-mono text-sm font-bold shadow " +
                      rankAccent(i)
                    }
                    aria-label={`Rank ${i + 1}`}
                  >
                    {i + 1}
                  </span>
                  {/* Display name: prefer the user's claimed Top Shot
                      username; fall back to a shortened wallet address
                      for users who haven't submitted a claim yet. The
                      full wallet is always available on hover. */}
                  <span
                    className="flex min-w-0 flex-col gap-0.5"
                    title={e.address}
                  >
                    {e.username ? (
                      <>
                        <span className="truncate text-sm font-semibold text-zinc-100">
                          {e.username}
                        </span>
                        <span className="truncate font-mono text-[10px] text-zinc-500">
                          {shortAddr(e.address)}
                        </span>
                      </>
                    ) : (
                      <span className="truncate font-mono text-sm text-zinc-200">
                        {shortAddr(e.address)}
                      </span>
                    )}
                  </span>
                  <span className="text-right">
                    <span className="font-mono text-lg font-semibold text-gold">
                      {e.completed.toLocaleString()}
                    </span>
                    <span className="ml-1 text-xs text-zinc-500">
                      / {data.totalRules || "—"}
                    </span>
                  </span>
                  <span className="hidden text-[11px] text-zinc-500 sm:inline">
                    {new Date(e.lastEarnedAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      <footer className="border-t border-white/5 px-6 py-5 text-center text-[11px] tracking-wide text-zinc-500">
        Top Shot ·{" "}
        <span className="font-mono">0x0b2a3299cc857e29</span>
        {" · "}Hybrid Custody ·{" "}
        <span className="font-mono">0xd8a7e05a7ac670c0</span>
      </footer>
    </div>
  );
}
