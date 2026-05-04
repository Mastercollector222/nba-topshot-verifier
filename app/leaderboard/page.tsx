"use client";

/**
 * app/leaderboard/page.tsx
 * ---------------------------------------------------------------------------
 * Public ranking page with two tabs:
 *
 *   1. **Challenges** (default) — number of completed reward rules per user,
 *      sourced from `lifetime_completions` (append-only).
 *   2. **TSR Points** — lifetime TSR balance per user, sourced from
 *      `lifetime_completions.tsr_points` + `tsr_adjustments.points`.
 *
 * Both tabs render a premium dark table with gold/silver/bronze rank
 * medallions and the user's Top Shot username (fallback: short wallet).
 *
 * Privacy: only Flow addresses + counts/points are exposed; no Moment
 * data leaves the server.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { Skeleton } from "@/components/Skeleton";

import { SiteHeader } from "@/components/SiteHeader";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChallengeEntry {
  address: string;
  username: string | null;
  avatarUrl: string | null;
  completed: number;
  lastEarnedAt: string;
}
interface ChallengeResponse {
  entries: ChallengeEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalRules: number;
  generatedAt: string;
}

interface TsrEntry {
  address: string;
  username: string | null;
  avatarUrl: string | null;
  total: number;
  fromChallenges: number;
  fromAdjustments: number;
}
interface TsrResponse {
  entries: TsrEntry[];
  page: number;
  pageSize: number;
  total: number;
  generatedAt: string;
}

type Tab = "challenges" | "tsr";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function AvatarCell({
  address,
  username,
  avatarUrl,
}: {
  address: string;
  username: string | null;
  avatarUrl: string | null;
}) {
  const fallbackInitials = username
    ? username.slice(0, 2).toUpperCase()
    : address.slice(2, 4).toUpperCase();
  return (
    <div className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={username ?? shortAddr(address)}
          width={36}
          height={36}
          className="h-9 w-9 rounded-lg object-cover"
          unoptimized={false}
        />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 via-amber-500 to-red-600 text-[11px] font-bold text-black">
          {fallbackInitials}
        </div>
      )}
    </div>
  );
}

function CollectorCell({
  address,
  username,
  avatarUrl,
}: {
  address: string;
  username: string | null;
  avatarUrl: string | null;
}) {
  const content = username ? (
    <>
      <span className="truncate text-sm font-semibold text-zinc-100 group-hover:text-orange-300 transition-colors">
        {username}
      </span>
      <span className="truncate font-mono text-[10px] text-zinc-500">
        {shortAddr(address)}
      </span>
    </>
  ) : (
    <span className="truncate font-mono text-sm text-zinc-200 group-hover:text-orange-300 transition-colors">
      {shortAddr(address)}
    </span>
  );

  return (
    <Link
      href={`/profile/${address}`}
      className="group flex min-w-0 flex-col gap-0.5"
      title={address}
    >
      {content}
    </Link>
  );
}

function RankMedallion({ rank }: { rank: number }) {
  return (
    <span
      className={
        "flex h-9 w-9 items-center justify-center rounded-full font-mono text-sm font-bold shadow " +
        rankAccent(rank)
      }
      aria-label={`Rank ${rank + 1}`}
    >
      {rank + 1}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>("challenges");
  const [page, setPage] = useState(1);

  const [challenges, setChallenges] = useState<ChallengeResponse | null>(null);
  const [tsr, setTsr] = useState<TsrResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch whichever tab is active whenever tab or page changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = `?page=${page}&pageSize=${PAGE_SIZE}`;
    (async () => {
      try {
        if (tab === "challenges") {
          const res = await fetch(`/api/leaderboard${params}`, { cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = (await res.json()) as ChallengeResponse;
          if (!cancelled) setChallenges(body);
        } else {
          const res = await fetch(`/api/leaderboard/tsr${params}`, { cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = (await res.json()) as TsrResponse;
          if (!cancelled) setTsr(body);
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load leaderboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, page]);

  function switchTab(t: Tab) {
    setTab(t);
    setPage(1); // reset to page 1 on tab switch
  }

  const activeData = tab === "challenges" ? challenges : tsr;
  const meta = activeData
    ? tab === "challenges" && challenges
      ? `${challenges.total.toLocaleString()} collectors · ${challenges.totalRules.toLocaleString()} active challenges · updated ${new Date(challenges.generatedAt).toLocaleString()}`
      : tsr
        ? `${tsr.total.toLocaleString()} ranked · updated ${new Date(tsr.generatedAt).toLocaleString()}`
        : null
    : null;

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
            {tab === "challenges"
              ? "Who's completed the most active challenges? Connect your wallet, scan your collection, and your address joins the board with every reward you earn."
              : "TSR — Top Shot Rewards. Earn points by completing challenges; admins may grant bonus points for events. Highest balance wins."}
          </p>

          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Leaderboard view"
            className="mt-2 inline-flex w-fit gap-1 rounded-full border border-white/10 bg-black/40 p-1"
          >
            {(
              [
                { id: "challenges", label: "Challenges" },
                { id: "tsr", label: "TSR Points" },
              ] as Array<{ id: Tab; label: string }>
            ).map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => switchTab(t.id)}
                  className={
                    "rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition " +
                    (active
                      ? "bg-gradient-to-r from-orange-500 to-amber-500 text-black shadow-[0_4px_18px_-6px_rgba(251,191,36,0.7)]"
                      : "text-zinc-400 hover:text-zinc-100")
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {meta ? (
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              {meta}
            </p>
          ) : null}
        </section>

        {loading ? (
          <div className="glass overflow-hidden rounded-2xl">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-white/5 px-5 py-4 last:border-0">
                <Skeleton className="h-9 w-14 shrink-0 rounded-xl" />
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <Skeleton className="h-4 flex-1 rounded-lg" />
                <Skeleton className="h-4 w-12 rounded-lg" />
                <Skeleton className="hidden h-4 w-20 rounded-lg sm:block" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-300">
            {error}
          </div>
        ) : tab === "challenges" ? (
          <ChallengesTable data={challenges} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
        ) : (
          <TsrTable data={tsr} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
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

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function PaginationFooter({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const lastPage = Math.ceil(total / pageSize);
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between border-t border-white/5 px-5 py-3">
      <span className="text-[11px] text-zinc-500">
        Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ← Prev
        </button>
        <span className="text-[11px] text-zinc-500">{page} / {lastPage}</span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= lastPage}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

function ChallengesTable({
  data,
  page,
  pageSize,
  onPage,
}: {
  data: ChallengeResponse | null;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  if (!data || data.entries.length === 0) {
    return (
      <div className="glass rounded-2xl p-12 text-center">
        <div className="text-4xl">🏆</div>
        <h3 className="mt-3 text-base font-semibold text-zinc-200">No collectors yet</h3>
        <p className="mt-1 text-sm text-zinc-400">Nobody has completed a challenge yet. Be the first.</p>
      </div>
    );
  }
  const offset = (page - 1) * pageSize;
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="grid grid-cols-[64px_36px_1fr_auto_auto] items-center gap-4 border-b border-white/5 px-5 py-3 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
        <span>Rank</span>
        <span />
        <span>Top Shot Collector</span>
        <span className="text-right">Completed</span>
        <span className="hidden sm:inline">Last earned</span>
      </div>
      <ul className="divide-y divide-white/5">
        {data.entries.map((e, i) => (
          <li
            key={e.address}
            className="grid grid-cols-[64px_36px_1fr_auto_auto] items-center gap-4 px-5 py-4 transition hover:bg-white/[0.02]"
          >
            <RankMedallion rank={offset + i} />
            <AvatarCell address={e.address} username={e.username} avatarUrl={e.avatarUrl} />
            <CollectorCell address={e.address} username={e.username} avatarUrl={e.avatarUrl} />
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
      <PaginationFooter page={page} pageSize={pageSize} total={data.total} onPage={onPage} />
    </div>
  );
}

function TsrTable({
  data,
  page,
  pageSize,
  onPage,
}: {
  data: TsrResponse | null;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  if (!data || data.entries.length === 0) {
    return (
      <div className="glass rounded-2xl p-12 text-center">
        <div className="text-4xl">🏆</div>
        <h3 className="mt-3 text-base font-semibold text-zinc-200">No TSR earned yet</h3>
        <p className="mt-1 text-sm text-zinc-400">Complete a challenge worth points to land on the board.</p>
      </div>
    );
  }
  const offset = (page - 1) * pageSize;
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="grid grid-cols-[64px_36px_1fr_auto] items-center gap-4 border-b border-white/5 px-5 py-3 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
        <span>Rank</span>
        <span />
        <span>Top Shot Collector</span>
        <span className="text-right">TSR</span>
      </div>
      <ul className="divide-y divide-white/5">
        {data.entries.map((e, i) => {
          const breakdown =
            e.fromAdjustments !== 0
              ? `${e.fromChallenges.toLocaleString()} from challenges · ${e.fromAdjustments > 0 ? "+" : ""}${e.fromAdjustments.toLocaleString()} adjustments`
              : `${e.fromChallenges.toLocaleString()} from challenges`;
          return (
            <li
              key={e.address}
              className="grid grid-cols-[64px_36px_1fr_auto] items-center gap-4 px-5 py-4 transition hover:bg-white/[0.02]"
            >
              <RankMedallion rank={offset + i} />
              <AvatarCell address={e.address} username={e.username} avatarUrl={e.avatarUrl} />
              <CollectorCell address={e.address} username={e.username} avatarUrl={e.avatarUrl} />
              <span className="text-right" title={breakdown}>
                <span className="font-mono text-lg font-semibold text-gold">
                  {e.total.toLocaleString()}
                </span>
                <span className="ml-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  TSR
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <PaginationFooter page={page} pageSize={pageSize} total={data.total} onPage={onPage} />
    </div>
  );
}
