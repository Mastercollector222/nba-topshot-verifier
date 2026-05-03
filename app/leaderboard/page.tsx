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

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>("challenges");

  const [challenges, setChallenges] = useState<ChallengeResponse | null>(null);
  const [tsr, setTsr] = useState<TsrResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // Fetch both leaderboards in parallel — tabs flip instantly.
        const [cRes, tRes] = await Promise.all([
          fetch("/api/leaderboard?limit=100", { cache: "no-store" }),
          fetch("/api/leaderboard/tsr?limit=100", { cache: "no-store" }),
        ]);
        if (!cRes.ok) throw new Error(`Challenges HTTP ${cRes.status}`);
        if (!tRes.ok) throw new Error(`TSR HTTP ${tRes.status}`);
        const cBody = (await cRes.json()) as ChallengeResponse;
        const tBody = (await tRes.json()) as TsrResponse;
        if (!cancelled) {
          setChallenges(cBody);
          setTsr(tBody);
        }
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

  const meta =
    tab === "challenges"
      ? challenges
        ? `${challenges.entries.length.toLocaleString()} collectors · ${challenges.totalRules.toLocaleString()} active challenges · updated ${new Date(challenges.generatedAt).toLocaleString()}`
        : null
      : tsr
        ? `${tsr.entries.length.toLocaleString()} ranked · updated ${new Date(tsr.generatedAt).toLocaleString()}`
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
                  onClick={() => setTab(t.id)}
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
        ) : tab === "challenges" ? (
          <ChallengesTable data={challenges} />
        ) : (
          <TsrTable data={tsr} />
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

function ChallengesTable({ data }: { data: ChallengeResponse | null }) {
  if (!data || data.entries.length === 0) {
    return (
      <div className="glass rounded-2xl py-16 text-center text-sm text-zinc-400">
        Nobody has completed a challenge yet. Be the first.
      </div>
    );
  }
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
            <RankMedallion rank={i} />
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
    </div>
  );
}

function TsrTable({ data }: { data: TsrResponse | null }) {
  if (!data || data.entries.length === 0) {
    return (
      <div className="glass rounded-2xl py-16 text-center text-sm text-zinc-400">
        No TSR earned yet. Complete a challenge worth points to land on
        the board.
      </div>
    );
  }
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
          // Tooltip exposes the breakdown so power users can audit.
          const breakdown =
            e.fromAdjustments !== 0
              ? `${e.fromChallenges.toLocaleString()} from challenges · ${e.fromAdjustments > 0 ? "+" : ""}${e.fromAdjustments.toLocaleString()} adjustments`
              : `${e.fromChallenges.toLocaleString()} from challenges`;
          return (
            <li
              key={e.address}
              className="grid grid-cols-[64px_36px_1fr_auto] items-center gap-4 px-5 py-4 transition hover:bg-white/[0.02]"
            >
              <RankMedallion rank={i} />
              <AvatarCell address={e.address} username={e.username} avatarUrl={e.avatarUrl} />
              <CollectorCell address={e.address} username={e.username} avatarUrl={e.avatarUrl} />
              <span
                className="text-right"
                title={breakdown}
              >
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
    </div>
  );
}
