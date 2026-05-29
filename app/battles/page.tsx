"use client";

/**
 * app/battles/page.tsx
 * ---------------------------------------------------------------------------
 * Stack Battles — 1v1 ELO-rated head-to-head competitions.
 *
 * Tabs:
 *   1. My Battles — invitations, active, history
 *   2. ELO Leaderboard — top 100 ranked players
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";

import { SiteHeader } from "@/components/SiteHeader";
import { toast } from "@/components/Toaster";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Battle {
  id: string;
  challengerAddress: string;
  opponentAddress: string;
  setId: number;
  playId: number;
  status: "pending" | "active" | "completed" | "declined" | "expired";
  challengerCountStart: number | null;
  opponentCountStart: number | null;
  challengerCountEnd: number | null;
  opponentCountEnd: number | null;
  winnerAddress: string | null;
  eloChange: number | null;
  createdAt: string;
  acceptedAt: string | null;
  expiresAt: string | null;
  settledAt: string | null;
  challengerUsername: string | null;
  opponentUsername: string | null;
  challengerAvatarUrl: string | null;
  opponentAvatarUrl: string | null;
}

interface BattleRating {
  flowAddress: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  peakElo: number;
  username: string | null;
  avatarUrl: string | null;
}

interface BattlesResponse {
  battles: Battle[];
  rating: BattleRating | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function displayName(username: string | null, address: string): string {
  return username || shortAddr(address);
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function msUntil(iso: string): number {
  return Math.max(0, new Date(iso).getTime() - Date.now());
}

function fmtCountdown(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-amber-500/10 text-amber-300 border-amber-400/30",
  active:    "bg-blue-500/10 text-blue-300 border-blue-400/30",
  completed: "bg-emerald-500/10 text-emerald-300 border-emerald-400/30",
  declined:  "bg-zinc-500/10 text-zinc-400 border-zinc-400/30",
  expired:   "bg-zinc-500/10 text-zinc-500 border-zinc-400/20",
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

type Tab = "battles" | "leaderboard";

export default function BattlesPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("battles");
  const [sessionAddr, setSessionAddr] = useState<string | null>(null);

  // My battles state
  const [battles, setBattles] = useState<Battle[]>([]);
  const [myRating, setMyRating] = useState<BattleRating | null>(null);
  const [loadingBattles, setLoadingBattles] = useState(true);

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState<BattleRating[]>([]);
  const [loadingLb, setLoadingLb] = useState(false);

  // Action loading
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Challenge creation modal
  const [showCreate, setShowCreate] = useState(false);
  const [createTarget, setCreateTarget] = useState("");
  const [createSetId, setCreateSetId] = useState("");
  const [createPlayId, setCreatePlayId] = useState("");
  const [creating, setCreating] = useState(false);

  // Open create modal from ?challenge= param
  useEffect(() => {
    const target = searchParams.get("challenge");
    if (target) {
      setCreateTarget(target);
      setShowCreate(true);
    }
  }, [searchParams]);

  // Fetch session
  useEffect(() => {
    fetch("/api/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { address: string | null }) => setSessionAddr(d.address ?? null))
      .catch(() => setSessionAddr(null));
  }, []);

  // Fetch battles
  const fetchBattles = useCallback(async () => {
    if (!sessionAddr) return;
    setLoadingBattles(true);
    try {
      const res = await fetch("/api/battles", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as BattlesResponse;
      setBattles(data.battles);
      setMyRating(data.rating);
    } catch {
      /* tolerate */
    } finally {
      setLoadingBattles(false);
    }
  }, [sessionAddr]);

  useEffect(() => {
    if (sessionAddr) void fetchBattles();
  }, [sessionAddr, fetchBattles]);

  // Fetch leaderboard on tab switch
  useEffect(() => {
    if (tab !== "leaderboard" || leaderboard.length > 0) return;
    setLoadingLb(true);
    fetch("/api/battles/leaderboard", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { leaderboard: BattleRating[] }) => setLeaderboard(d.leaderboard ?? []))
      .catch(() => setLeaderboard([]))
      .finally(() => setLoadingLb(false));
  }, [tab, leaderboard.length]);

  // Accept / decline handlers
  const handleAction = useCallback(
    async (action: "accept" | "decline", battleId: string) => {
      setActionLoading(battleId);
      try {
        const res = await fetch("/api/battles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, battleId }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed");
        toast(
          action === "accept" ? "Battle accepted! Game on!" : "Battle declined.",
          action === "accept" ? "success" : "info",
        );
        void fetchBattles();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed", "error");
      } finally {
        setActionLoading(null);
      }
    },
    [fetchBattles],
  );

  // Create battle handler
  const handleCreate = useCallback(async () => {
    if (!createTarget || !createSetId || !createPlayId) {
      toast("Fill in all fields", "error");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/battles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          opponentAddress: createTarget.trim().toLowerCase(),
          setId: Number(createSetId),
          playId: Number(createPlayId),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast("Battle challenge sent!", "success");
      setShowCreate(false);
      setCreateTarget("");
      setCreateSetId("");
      setCreatePlayId("");
      void fetchBattles();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setCreating(false);
    }
  }, [createTarget, createSetId, createPlayId, fetchBattles]);

  // Categorize battles
  const incoming = battles.filter(
    (b) => b.status === "pending" && b.opponentAddress === sessionAddr,
  );
  const outgoing = battles.filter(
    (b) => b.status === "pending" && b.challengerAddress === sessionAddr,
  );
  const active = battles.filter((b) => b.status === "active");
  const history = battles.filter(
    (b) => b.status === "completed" || b.status === "declined" || b.status === "expired",
  );

  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader subtitle="Battles" />

      {/* Create Battle Modal */}
      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-zinc-100">⚔️ New Stack Battle</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Pick a moment (set + play ID). Both players lock as many copies as
              possible in 24 hours. Whoever locks more wins +50 TSR and ELO.
            </p>
            <div className="mt-5 space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  Opponent address
                </label>
                <input
                  type="text"
                  value={createTarget}
                  onChange={(e) => setCreateTarget(e.target.value)}
                  placeholder="0x1234567890abcdef"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-orange-400/50 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    Set ID
                  </label>
                  <input
                    type="number"
                    value={createSetId}
                    onChange={(e) => setCreateSetId(e.target.value)}
                    placeholder="e.g. 42"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-orange-400/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    Play ID
                  </label>
                  <input
                    type="number"
                    value={createPlayId}
                    onChange={(e) => setCreatePlayId(e.target.value)}
                    placeholder="e.g. 12345"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-orange-400/50 focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg px-4 py-2 text-sm text-zinc-400 transition hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="rounded-lg bg-gradient-to-r from-orange-500 to-red-500 px-5 py-2 text-sm font-semibold text-black shadow transition hover:brightness-110 disabled:opacity-50"
              >
                {creating ? "Sending…" : "Send Challenge"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              ⚔️ Stack Battles
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Challenge any collector to a 1v1. Lock more moments in 24 hours to win.
            </p>
          </div>
          {myRating ? (
            <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  ELO
                </p>
                <p className="text-2xl font-bold text-zinc-100">
                  {myRating.elo}
                </p>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                  W
                </p>
                <p className="text-lg font-semibold text-emerald-300">
                  {myRating.wins}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-400">
                  L
                </p>
                <p className="text-lg font-semibold text-red-300">
                  {myRating.losses}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  D
                </p>
                <p className="text-lg font-semibold text-zinc-400">
                  {myRating.draws}
                </p>
              </div>
              {myRating.currentStreak > 0 ? (
                <>
                  <div className="h-8 w-px bg-white/10" />
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400">
                      Streak
                    </p>
                    <p className="text-lg font-semibold text-orange-300">
                      🔥 {myRating.currentStreak}
                    </p>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
          {sessionAddr ? (
            <button
              onClick={() => setShowCreate(true)}
              className="h-10 shrink-0 rounded-full bg-gradient-to-r from-orange-500 to-red-500 px-5 text-sm font-semibold text-black shadow-[0_8px_24px_-8px_rgba(251,113,38,0.7)] transition hover:brightness-110"
            >
              ⚔️ New Battle
            </button>
          ) : null}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1">
          {(["battles", "leaderboard"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                tab === t
                  ? "bg-orange-500/15 text-orange-300"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t === "battles" ? "My Battles" : "ELO Leaderboard"}
            </button>
          ))}
        </div>

        {/* BATTLES TAB */}
        {tab === "battles" ? (
          !sessionAddr ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
              <p className="text-sm text-zinc-400">
                <Link href="/dashboard" className="text-orange-400 underline">
                  Sign in
                </Link>{" "}
                to view and create battles.
              </p>
            </div>
          ) : loadingBattles ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-xl bg-white/[0.03] motion-safe:animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Incoming invitations */}
              {incoming.length > 0 ? (
                <section>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-amber-300">
                    Incoming challenges ({incoming.length})
                  </h2>
                  <div className="space-y-2">
                    {incoming.map((b) => (
                      <BattleCard
                        key={b.id}
                        battle={b}
                        sessionAddr={sessionAddr}
                        onAccept={() => handleAction("accept", b.id)}
                        onDecline={() => handleAction("decline", b.id)}
                        loading={actionLoading === b.id}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {/* Outgoing */}
              {outgoing.length > 0 ? (
                <section>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
                    Sent challenges ({outgoing.length})
                  </h2>
                  <div className="space-y-2">
                    {outgoing.map((b) => (
                      <BattleCard
                        key={b.id}
                        battle={b}
                        sessionAddr={sessionAddr}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {/* Active */}
              {active.length > 0 ? (
                <section>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-blue-300">
                    Active battles ({active.length})
                  </h2>
                  <div className="space-y-2">
                    {active.map((b) => (
                      <BattleCard
                        key={b.id}
                        battle={b}
                        sessionAddr={sessionAddr}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {/* History */}
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
                  Battle history ({history.length})
                </h2>
                {history.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
                    <p className="text-4xl">⚔️</p>
                    <p className="mt-3 text-sm text-zinc-400">
                      No battles yet. Visit any collector&apos;s profile and hit
                      &quot;Challenge to Battle&quot;!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {history.map((b) => (
                      <BattleCard
                        key={b.id}
                        battle={b}
                        sessionAddr={sessionAddr}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )
        ) : null}

        {/* LEADERBOARD TAB */}
        {tab === "leaderboard" ? (
          loadingLb ? (
            <div className="space-y-2">
              {[...Array(10)].map((_, i) => (
                <div
                  key={i}
                  className="h-14 rounded-xl bg-white/[0.03] motion-safe:animate-pulse"
                />
              ))}
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-zinc-400">
              No ranked players yet. Start a battle to appear here!
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3 text-right">ELO</th>
                    <th className="hidden px-4 py-3 text-right sm:table-cell">W</th>
                    <th className="hidden px-4 py-3 text-right sm:table-cell">L</th>
                    <th className="hidden px-4 py-3 text-right sm:table-cell">Peak</th>
                    <th className="hidden px-4 py-3 text-right sm:table-cell">Streak</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {leaderboard.map((r, i) => {
                    const isMe = r.flowAddress === sessionAddr;
                    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
                    return (
                      <tr
                        key={r.flowAddress}
                        className={isMe ? "bg-orange-500/5" : "hover:bg-white/[0.02]"}
                      >
                        <td className="px-4 py-3 font-mono text-zinc-400">
                          {medal ?? i + 1}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/profile/${r.flowAddress}`}
                            className="flex items-center gap-2.5 hover:text-orange-300"
                          >
                            {r.avatarUrl ? (
                              <Image
                                src={r.avatarUrl}
                                alt=""
                                width={28}
                                height={28}
                                className="h-7 w-7 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-zinc-400">
                                {(r.username?.[0] ?? r.flowAddress.slice(2, 4)).toUpperCase()}
                              </div>
                            )}
                            <span className="font-medium text-zinc-100">
                              {displayName(r.username, r.flowAddress)}
                            </span>
                            {isMe ? (
                              <span className="rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-orange-300">
                                You
                              </span>
                            ) : null}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-zinc-100">
                          {r.elo}
                        </td>
                        <td className="hidden px-4 py-3 text-right text-emerald-300 sm:table-cell">
                          {r.wins}
                        </td>
                        <td className="hidden px-4 py-3 text-right text-red-300 sm:table-cell">
                          {r.losses}
                        </td>
                        <td className="hidden px-4 py-3 text-right font-mono text-zinc-400 sm:table-cell">
                          {r.peakElo}
                        </td>
                        <td className="hidden px-4 py-3 text-right sm:table-cell">
                          {r.currentStreak > 0 ? (
                            <span className="text-orange-300">🔥 {r.currentStreak}</span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BattleCard                                                         */
/* ------------------------------------------------------------------ */

function BattleCard({
  battle: b,
  sessionAddr,
  onAccept,
  onDecline,
  loading,
}: {
  battle: Battle;
  sessionAddr: string;
  onAccept?: () => void;
  onDecline?: () => void;
  loading?: boolean;
}) {
  const [tick, setTick] = useState(Date.now());

  // Tick every second for countdown
  useEffect(() => {
    if (b.status !== "active" && b.status !== "pending") return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [b.status]);

  const isChallenger = b.challengerAddress === sessionAddr;
  const myCountStart = isChallenger ? b.challengerCountStart : b.opponentCountStart;
  const theirCountStart = isChallenger ? b.opponentCountStart : b.challengerCountStart;
  const myCountEnd = isChallenger ? b.challengerCountEnd : b.opponentCountEnd;
  const theirCountEnd = isChallenger ? b.opponentCountEnd : b.challengerCountEnd;
  const opponentAddr = isChallenger ? b.opponentAddress : b.challengerAddress;
  const opponentName = displayName(
    isChallenger ? b.opponentUsername : b.challengerUsername,
    opponentAddr,
  );
  const opponentAvatar = isChallenger ? b.opponentAvatarUrl : b.challengerAvatarUrl;

  const iWon = b.winnerAddress === sessionAddr;
  const isDraw = b.status === "completed" && !b.winnerAddress;

  return (
    <div
      className={`rounded-xl border p-4 ${
        b.status === "active"
          ? "border-blue-400/30 bg-blue-500/5"
          : b.status === "pending"
            ? "border-amber-400/20 bg-amber-500/5"
            : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Left: opponent info */}
        <div className="flex items-center gap-3">
          <Link href={`/profile/${opponentAddr}`}>
            {opponentAvatar ? (
              <Image
                src={opponentAvatar}
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-zinc-400">
                {(opponentName[0] ?? "?").toUpperCase()}
              </div>
            )}
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-100">
                vs {opponentName}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${STATUS_COLORS[b.status]}`}
              >
                {b.status}
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Set {b.setId} · Play #{b.playId} · {relTime(b.createdAt)}
            </p>
          </div>
        </div>

        {/* Right: actions or results */}
        <div className="flex items-center gap-3">
          {b.status === "pending" && b.opponentAddress === sessionAddr ? (
            <>
              <button
                onClick={onAccept}
                disabled={loading}
                className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-50"
              >
                Accept
              </button>
              <button
                onClick={onDecline}
                disabled={loading}
                className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/30 disabled:opacity-50"
              >
                Decline
              </button>
            </>
          ) : b.status === "pending" ? (
            <span className="text-xs text-amber-300/70">Waiting for response…</span>
          ) : b.status === "active" && b.expiresAt ? (
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
                Ends in
              </p>
              <p className="font-mono text-sm font-semibold text-blue-300">
                {fmtCountdown(msUntil(b.expiresAt))}
              </p>
            </div>
          ) : b.status === "completed" ? (
            <div className="text-right">
              {isDraw ? (
                <span className="rounded-full bg-zinc-400/10 px-2.5 py-1 text-xs font-semibold text-zinc-300">
                  Draw
                </span>
              ) : iWon ? (
                <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                  Won +{b.eloChange} ELO
                </span>
              ) : (
                <span className="rounded-full bg-red-400/10 px-2.5 py-1 text-xs font-semibold text-red-300">
                  Lost −{b.eloChange} ELO
                </span>
              )}
              {myCountEnd != null && theirCountEnd != null ? (
                <p className="mt-0.5 text-[10px] text-zinc-500">
                  You: {myCountEnd} vs {theirCountEnd}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
