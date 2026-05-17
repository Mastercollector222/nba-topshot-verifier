"use client";

/**
 * app/test-your-stack/page.tsx
 * ---------------------------------------------------------------------------
 * Public "Test Your Stack" arena. Vibrant, video-game-style UI showing every
 * enabled challenge with live leaderboards, countdown timers, and the
 * viewer's own stack count + rank.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Challenge {
  id: string;
  title: string;
  subtitle: string | null;
  setId: number;
  playId: number;
  playerName: string | null;
  setName: string | null;
  series: number | null;
  tier: string | null;
  thumbnailUrl: string | null;
  startsAt: string;
  endsAt: string;
  prizeTitle: string;
  prizeDescription: string | null;
  prizeImageUrl: string | null;
  accentColor: string | null;
  winnerAddress: string | null;
  winnerCount: number | null;
  settledAt: string | null;
}

interface LeaderboardRow {
  address: string;
  count: number;
  username: string | null;
  rank: number;
}

interface LeaderboardResponse {
  challenge: Challenge;
  leaderboard: LeaderboardRow[];
  you: { rank: number | null; count: number } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function useCountdown(targetIso: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const target = useMemo(() => Date.parse(targetIso), [targetIso]);
  const remaining = Math.max(0, target - now);
  const totalSec = Math.floor(remaining / 1000);
  const days  = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins  = Math.floor((totalSec % 3600) / 60);
  const secs  = totalSec % 60;
  return { days, hours, mins, secs, expired: remaining === 0 };
}

function rankAura(rank: number) {
  if (rank === 1) return { ring: "ring-yellow-400/60", glow: "shadow-[0_0_28px_rgba(250,204,21,0.5)]", badge: "bg-yellow-400 text-yellow-950", icon: "🥇" };
  if (rank === 2) return { ring: "ring-zinc-300/50",   glow: "shadow-[0_0_22px_rgba(212,212,216,0.35)]", badge: "bg-zinc-300 text-zinc-900",  icon: "🥈" };
  if (rank === 3) return { ring: "ring-amber-600/50",  glow: "shadow-[0_0_22px_rgba(217,119,6,0.35)]",   badge: "bg-amber-600 text-amber-50",  icon: "🥉" };
  return { ring: "ring-white/5", glow: "", badge: "bg-zinc-700/60 text-zinc-300", icon: "" };
}

// ---------------------------------------------------------------------------
// Countdown pill
// ---------------------------------------------------------------------------

function Countdown({ endsAt, accent }: { endsAt: string; accent: string }) {
  const c = useCountdown(endsAt);
  if (c.expired) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-red-500/15 px-4 py-1.5 text-sm font-bold uppercase tracking-wider text-red-300">
        ⏱ Time's up
      </span>
    );
  }
  const Cell = ({ n, label }: { n: number; label: string }) => (
    <div className="flex flex-col items-center">
      <span
        className="font-mono text-xl font-black leading-none tabular-nums sm:text-2xl lg:text-3xl"
        style={{ color: accent, textShadow: `0 0 14px ${accent}80` }}
      >
        {String(n).padStart(2, "0")}
      </span>
      <span className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-zinc-500">
        {label}
      </span>
    </div>
  );
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 sm:gap-3 sm:px-5 sm:py-3 backdrop-blur">
      {c.days > 0 && <Cell n={c.days} label="days" />}
      <Cell n={c.hours} label="hr" />
      <span className="self-start pt-1 text-xl font-black text-zinc-700 sm:text-2xl">:</span>
      <Cell n={c.mins} label="min" />
      <span className="self-start pt-1 text-xl font-black text-zinc-700 sm:text-2xl">:</span>
      <Cell n={c.secs} label="sec" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Challenge arena
// ---------------------------------------------------------------------------

function ChallengeArena({ challenge: ch0 }: { challenge: Challenge }) {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const accent = ch0.accentColor ?? "#f97316";

  useEffect(() => {
    let alive = true;
    const fetchOnce = async () => {
      const res = await fetch(`/api/stack-challenges/${encodeURIComponent(ch0.id)}/leaderboard?limit=50`, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as LeaderboardResponse;
      if (alive) setData(body);
    };
    void fetchOnce();
    const t = setInterval(fetchOnce, 15_000); // poll every 15s
    return () => { alive = false; clearInterval(t); };
  }, [ch0.id]);

  const ch = data?.challenge ?? ch0;
  const board = data?.leaderboard ?? [];
  const you   = data?.you ?? null;
  const top   = board[0];
  const yourPct = top && you && top.count > 0 ? Math.min(100, (you.count / top.count) * 100) : 0;
  const ended = Date.parse(ch.endsAt) <= Date.now();

  return (
    <section
      id={ch.id}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 shadow-2xl"
      style={{
        backgroundImage: `radial-gradient(1200px 320px at 50% -120px, ${accent}33 0%, transparent 60%)`,
      }}
    >
      {/* Animated grid floor */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            `linear-gradient(${accent} 1px, transparent 1px), linear-gradient(90deg, ${accent} 1px, transparent 1px)`,
          backgroundSize: "44px 44px",
          maskImage: "linear-gradient(to bottom, black 0%, transparent 80%)",
        }}
      />

      <div className="relative grid gap-6 p-4 lg:grid-cols-[1fr_minmax(0,420px)] lg:gap-8 lg:p-10">
        {/* LEFT: Hero */}
        <div className="flex flex-col gap-4 sm:gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]"
              style={{ background: `${accent}1f`, color: accent }}
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: accent }} />
              {ended ? (ch.settledAt ? "Settled" : "Awaiting settlement") : "Live battle"}
            </span>
            {ch.tier && (
              <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-zinc-400">
                {ch.tier}
              </span>
            )}
          </div>

          <div>
            <h2
              className="text-2xl font-black leading-none tracking-tight sm:text-3xl lg:text-4xl xl:text-5xl"
              style={{
                background: `linear-gradient(120deg, #fff 0%, ${accent} 50%, #fff 100%)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundSize: "200% 100%",
                animation: "tys-shine 6s linear infinite",
              }}
            >
              {ch.title}
            </h2>
            {ch.subtitle && (
              <p className="mt-2 max-w-xl text-xs text-zinc-400 sm:text-sm lg:text-base">{ch.subtitle}</p>
            )}
          </div>

          {/* Target moment */}
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 p-3 backdrop-blur sm:gap-4 sm:p-4">
            {ch.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ch.thumbnailUrl}
                alt=""
                className="h-16 w-16 flex-none rounded-xl object-cover ring-2 ring-white/10 sm:h-20 sm:w-20"
                style={{ boxShadow: `0 0 32px ${accent}55` }}
              />
            ) : (
              <div className="h-16 w-16 flex-none rounded-xl bg-zinc-800 sm:h-20 sm:w-20" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Target moment</p>
              <p className="mt-1 truncate text-base font-bold text-zinc-100 sm:text-lg">
                {ch.playerName ?? "—"}
              </p>
              <p className="truncate text-[11px] text-zinc-500 sm:text-xs">
                {ch.setName ?? `Set ${ch.setId}`} · Play #{ch.playId}
                {ch.series != null && ` · Series ${ch.series}`}
              </p>
              <p className="mt-1 text-[10px] text-zinc-600 sm:mt-1.5 sm:text-[11px]">
                Only <span className="font-semibold text-zinc-300">locked</span> copies count.
              </p>
            </div>
          </div>

          {/* Timer + prize */}
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <Countdown endsAt={ch.endsAt} accent={accent} />
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-gradient-to-br from-yellow-500/10 to-amber-500/5 p-3">
              <div className="text-3xl">🏆</div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Grand prize</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-zinc-100">{ch.prizeTitle}</p>
                {ch.prizeDescription && (
                  <p className="truncate text-[11px] text-zinc-500">{ch.prizeDescription}</p>
                )}
              </div>
            </div>
          </div>

          {/* YOUR STACK */}
          <div
            className="rounded-2xl border bg-black/50 p-5 backdrop-blur"
            style={{ borderColor: `${accent}40` }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400 sm:tracking-[0.25em]">
                Your stack
              </p>
              {you?.rank && (
                <p className="text-[11px] text-zinc-500 sm:text-xs">
                  Rank <span className="font-bold text-zinc-200">#{you.rank}</span>
                </p>
              )}
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span
                className="font-mono text-4xl font-black leading-none tabular-nums sm:text-5xl lg:text-6xl"
                style={{ color: accent, textShadow: `0 0 24px ${accent}80` }}
              >
                {you?.count ?? 0}
              </span>
              {top && (
                <span className="mb-1 text-xs text-zinc-500 sm:text-sm">
                  / {top.count} <span className="text-zinc-600">leader</span>
                </span>
              )}
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${yourPct}%`,
                  background: `linear-gradient(90deg, ${accent}, ${accent}cc)`,
                  boxShadow: `0 0 14px ${accent}cc`,
                }}
              />
            </div>
            {!you ? (
              <p className="mt-3 text-xs text-zinc-500">
                Sign in and verify your wallet to compete.
              </p>
            ) : you.count === 0 ? (
              <p className="mt-3 text-xs text-zinc-500">
                You don't have this moment locked yet. Buy + lock to enter.
              </p>
            ) : top && you.count >= top.count ? (
              <p className="mt-3 text-xs font-bold" style={{ color: accent }}>
                👑 You're at the top! Hold the line.
              </p>
            ) : (
              <p className="mt-3 text-xs text-zinc-500">
                {top ? `+${top.count - you.count} to overtake the leader.` : ""}
              </p>
            )}
          </div>
        </div>

        {/* RIGHT: Leaderboard */}
        <div className="flex flex-col rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-300">
              Leaderboard
            </h3>
            <span className="text-[10px] text-zinc-600">refresh ~15s</span>
          </div>
          <div className="mt-2 -mx-2 flex-1 space-y-1 overflow-y-auto pr-1" style={{ maxHeight: "min(560px, 50vh)" }}>
            {board.length === 0 ? (
              <p className="px-2 py-8 text-center text-xs text-zinc-600">
                No challengers yet. Be the first.
              </p>
            ) : (
              board.map((row) => {
                const aura = rankAura(row.rank);
                const isYou = you && data?.leaderboard.find((r) => r.address === row.address && row.rank === you.rank);
                const isCreator = row.address === "0x214fdf1a68530b98";
                return (
                  <div
                    key={row.address}
                    className={`flex items-center gap-3 rounded-xl bg-white/[0.02] px-3 py-2 ring-1 transition ${aura.ring} ${aura.glow} ${
                      isYou ? "outline outline-1 outline-orange-400/40" : ""
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg text-xs font-black ${aura.badge}`}
                    >
                      {aura.icon || `#${row.rank}`}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-zinc-100">
                          {row.username ?? shortAddr(row.address)}
                        </p>
                        {isCreator && (
                          <span className="flex-shrink-0 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-zinc-400">
                            Creator, not competing
                          </span>
                        )}
                      </div>
                      {row.username && (
                        <p className="truncate font-mono text-[10px] text-zinc-600">{shortAddr(row.address)}</p>
                      )}
                    </div>
                    <span
                      className="font-mono text-lg font-black tabular-nums"
                      style={row.rank <= 3 ? { color: accent } : undefined}
                    >
                      {row.count}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes tys-shine {
          0%   { background-position: 0%   50%; }
          100% { background-position: 200% 50%; }
        }
      `}</style>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TestYourStackPage() {
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);

  useEffect(() => {
    void fetch("/api/stack-challenges", { cache: "no-store" })
      .then((r) => r.ok ? r.json() as Promise<{ challenges: Challenge[] }> : { challenges: [] })
      .then((d) => setChallenges(d.challenges));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <SiteHeader />

      {/* Header banner */}
      <div className="relative overflow-hidden border-b border-white/5 bg-gradient-to-br from-orange-500/15 via-fuchsia-500/10 to-cyan-500/15">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 100%, black 0%, transparent 80%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12 lg:py-16">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-orange-300/90 sm:text-[11px]">
            Live Arena · Locked Stacks Only
          </p>
          <h1
            className="mt-3 text-3xl font-black leading-[0.95] tracking-tight sm:text-4xl lg:text-5xl xl:text-6xl"
            style={{
              background: "linear-gradient(120deg, #fff 0%, #f97316 35%, #ec4899 70%, #fff 100%)",
              backgroundSize: "300% 100%",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              animation: "tys-shine 7s linear infinite",
            }}
          >
            TEST&nbsp;YOUR&nbsp;STACK
          </h1>
          <p className="mt-3 max-w-2xl text-xs text-zinc-400 sm:text-sm lg:text-base">
            Pick a moment. Lock more than anyone else before the timer hits zero. Take the prize.
          </p>
        </div>
        <style jsx>{`
          @keyframes tys-shine {
            0%   { background-position: 0%   50%; }
            100% { background-position: 300% 50%; }
          }
        `}</style>
      </div>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6">
        {challenges === null ? (
          <div className="space-y-6">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-96 animate-pulse rounded-3xl bg-white/[0.04]" />
            ))}
          </div>
        ) : challenges.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/40 p-16 text-center">
            <p className="text-6xl">🎯</p>
            <h2 className="mt-4 text-2xl font-bold">No challenges right now</h2>
            <p className="mt-2 text-sm text-zinc-500">
              The arena is dark — but a new battle is brewing. Check back soon.
            </p>
          </div>
        ) : (
          challenges.map((ch) => <ChallengeArena key={ch.id} challenge={ch} />)
        )}
      </main>
    </div>
  );
}
