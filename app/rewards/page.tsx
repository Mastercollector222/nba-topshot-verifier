"use client";

/**
 * app/rewards/page.tsx
 * ---------------------------------------------------------------------------
 * Gamification dashboard. Shows the signed-in user's TSR award activity:
 *   - Hero: total gamification TSR + current streak + next streak milestone
 *   - Streak ladder: all 7 milestones, marked earned / locked
 *   - Daily actions: today's status (claimed / available) for follow, message,
 *     share-profile
 *   - One-time profile awards: avatar + bio
 *   - Recent ledger: chronological list of every award with timestamp
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { DailyResetCountdown } from "@/components/DailyResetCountdown";
import { ReferralsCard } from "@/components/ReferralsCard";
import { TIERS, getTier } from "@/lib/tiers";
import { TierBadge } from "@/components/TierBadge";
import { NotificationsCard } from "@/components/NotificationsCard";

interface AwardRow {
  reason_key: string;
  reason: string | null;
  points: number;
  created_at: string;
}

interface Data {
  today: string;
  streak: { current: number; longest: number; lastSeenDate: string | null };
  awards: AwardRow[];
  totalEarned: number;
  tsrTotal: number;
}

const STREAK_LADDER: Array<{ day: number; points: number }> = [
  { day: 1, points: 10 },
  { day: 5, points: 20 },
  { day: 10, points: 40 },
  { day: 20, points: 80 },
  { day: 40, points: 160 },
  { day: 80, points: 320 },
  { day: 160, points: 1000 },
];

const DAILY_ACTIONS: Array<{
  kind: "follow.daily" | "message.daily" | "share.profile.daily";
  label: string;
  points: number;
  hint: string;
}> = [
  { kind: "follow.daily", label: "Follow a user", points: 5, hint: "Visit any profile and tap Follow" },
  { kind: "message.daily", label: "Send a message", points: 5, hint: "Open Messages and start a thread" },
  { kind: "share.profile.daily", label: "Share your profile on X", points: 10, hint: "Tap Share on your own profile" },
];

const ONE_TIME: Array<{ key: string; label: string; points: number; hint: string }> = [
  { key: "profile.avatar.first", label: "Set a profile picture", points: 50, hint: "Upload an avatar on your profile" },
  { key: "profile.bio.first", label: "Write a profile bio", points: 20, hint: "Add a bio (up to 500 chars)" },
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function RewardsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/me/gamification", { cache: "no-store" });
        if (res.status === 401) {
          if (!cancelled) setError("Sign in to view your rewards.");
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Data;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build lookup sets
  const claimedKeys = new Set(data?.awards.map((a) => a.reason_key) ?? []);
  const today = data?.today;
  const dailyKeyToday = (kind: string) => `${kind}.${today}`;

  const currentStreak = data?.streak.current ?? 0;
  const nextMilestone = STREAK_LADDER.find((m) => m.day > currentStreak);

  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader subtitle="Rewards" />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Rewards
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Earn TSR by engaging with the community. Daily actions reset at midnight UTC.
          </p>
        </div>

        {loading ? (
          <div className="space-y-6">
            <div className="motion-safe:animate-pulse h-32 rounded-2xl bg-white/[0.03]" />
            <div className="motion-safe:animate-pulse h-48 rounded-2xl bg-white/[0.03]" />
            <div className="motion-safe:animate-pulse h-48 rounded-2xl bg-white/[0.03]" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-6 text-center text-sm text-red-300">
            {error}
            {error.includes("Sign in") && (
              <div className="mt-3">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center rounded-full bg-orange-500 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-orange-400"
                >
                  Go to dashboard to sign in
                </Link>
              </div>
            )}
          </div>
        ) : data ? (
          <>
            {/* HERO */}
            <section className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-amber-500/10 to-orange-500/10 p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300">
                  Earned via gamification
                </p>
                <p className="mt-2 text-3xl font-bold text-zinc-100">
                  {data.totalEarned.toLocaleString()}
                </p>
                <p className="text-xs text-zinc-500">TSR points</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-300">
                  Current streak
                </p>
                <p className="mt-2 text-3xl font-bold text-zinc-100">
                  🔥 {currentStreak}
                </p>
                <p className="text-xs text-zinc-500">
                  {currentStreak === 0 ? "Visit daily to start" : `day${currentStreak === 1 ? "" : "s"} in a row`}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Next streak reward
                </p>
                {nextMilestone ? (
                  <>
                    <p className="mt-2 text-3xl font-bold text-zinc-100">
                      +{nextMilestone.points}
                    </p>
                    <p className="text-xs text-zinc-500">
                      at {nextMilestone.day}-day streak ({nextMilestone.day - currentStreak} to go)
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-3xl font-bold text-emerald-300">Max</p>
                    <p className="text-xs text-zinc-500">All milestones unlocked</p>
                  </>
                )}
              </div>
            </section>

            {/* DAILY RESET COUNTDOWN */}
            <section>
              <DailyResetCountdown streakDays={currentStreak} />
            </section>

            {/* STREAK LADDER */}
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-300">
                Login streak milestones
              </h2>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <ul className="divide-y divide-white/5">
                  {STREAK_LADDER.map((m) => {
                    const key = `streak.day.${m.day}`;
                    const earned = claimedKeys.has(key);
                    const award = data.awards.find((a) => a.reason_key === key);
                    return (
                      <li key={m.day} className="flex items-center justify-between gap-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold " +
                              (earned
                                ? "bg-emerald-400/20 text-emerald-300"
                                : "border border-white/10 bg-white/5 text-zinc-500")
                            }
                          >
                            {earned ? "✓" : m.day}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-zinc-100">
                              {m.day}-day streak
                            </p>
                            <p className="text-xs text-zinc-500">
                              {earned && award ? `Claimed ${fmtDate(award.created_at)}` : "Locked"}
                            </p>
                          </div>
                        </div>
                        <span
                          className={
                            "rounded-full px-3 py-1 text-xs font-semibold " +
                            (earned
                              ? "bg-emerald-400/10 text-emerald-300"
                              : "bg-white/5 text-zinc-400")
                          }
                        >
                          +{m.points} TSR
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>

            {/* DAILY ACTIONS */}
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-300">
                Today&apos;s daily actions
              </h2>
              <div className="grid gap-2 sm:grid-cols-3">
                {DAILY_ACTIONS.map((a) => {
                  const claimed = claimedKeys.has(dailyKeyToday(a.kind));
                  return (
                    <div
                      key={a.kind}
                      className={
                        "rounded-2xl border p-4 " +
                        (claimed
                          ? "border-emerald-400/20 bg-emerald-400/5"
                          : "border-white/10 bg-white/[0.03]")
                      }
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-zinc-100">{a.label}</p>
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider " +
                            (claimed
                              ? "bg-emerald-400/20 text-emerald-300"
                              : "bg-orange-500/10 text-orange-300")
                          }
                        >
                          {claimed ? "Claimed" : `+${a.points}`}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">{a.hint}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ONE-TIME PROFILE */}
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-300">
                Profile completion (one-time)
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {ONE_TIME.map((a) => {
                  const earned = claimedKeys.has(a.key);
                  const award = data.awards.find((x) => x.reason_key === a.key);
                  return (
                    <div
                      key={a.key}
                      className={
                        "rounded-2xl border p-4 " +
                        (earned
                          ? "border-emerald-400/20 bg-emerald-400/5"
                          : "border-white/10 bg-white/[0.03]")
                      }
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-zinc-100">{a.label}</p>
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider " +
                            (earned
                              ? "bg-emerald-400/20 text-emerald-300"
                              : "bg-amber-500/10 text-amber-300")
                          }
                        >
                          {earned ? "Claimed" : `+${a.points}`}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {earned && award ? `Claimed ${fmtDate(award.created_at)}` : a.hint}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* TIERS */}
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-300">
                Profile tiers
              </h2>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                {(() => {
                  const currentTier = getTier(data.tsrTotal).id;
                  const currentIdx = TIERS.findIndex((t) => t.id === currentTier);
                  return (
                    <ul className="divide-y divide-white/5">
                      {TIERS.map((t, i) => {
                        const reached = i <= currentIdx;
                        const isCurrent = t.id === currentTier;
                        const remaining = Math.max(0, t.minTsr - data.tsrTotal);
                        return (
                          <li
                            key={t.id}
                            className={
                              "flex items-center justify-between gap-4 py-3 " +
                              (isCurrent ? "" : "")
                            }
                          >
                            <div className="flex items-center gap-3">
                              <TierBadge tier={t.id} />
                              <div>
                                <p className="text-sm font-medium text-zinc-100">
                                  {t.perk}
                                </p>
                                <p className="text-xs text-zinc-500">
                                  {t.minTsr === 0
                                    ? "Available to everyone"
                                    : `${t.minTsr.toLocaleString()} TSR required`}
                                </p>
                              </div>
                            </div>
                            <span
                              className={
                                "rounded-full px-3 py-1 text-xs font-semibold " +
                                (reached
                                  ? isCurrent
                                    ? "bg-emerald-400/15 text-emerald-300"
                                    : "bg-emerald-400/10 text-emerald-300/70"
                                  : "bg-white/5 text-zinc-400")
                              }
                            >
                              {isCurrent
                                ? "Current"
                                : reached
                                  ? "Unlocked"
                                  : `${remaining.toLocaleString()} to go`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  );
                })()}
              </div>
            </section>

            {/* NOTIFICATIONS */}
            <NotificationsCard />

            {/* REFERRALS */}
            <ReferralsCard />

            {/* LEDGER */}
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-300">
                Recent awards ({data.awards.length})
              </h2>
              {data.awards.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] py-12 text-center text-sm text-zinc-500">
                  No gamification awards yet. Start engaging to earn TSR!
                </div>
              ) : (
                <ul className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.03]">
                  {data.awards.slice(0, 50).map((a, i) => (
                    <li
                      key={`${a.reason_key}-${a.created_at}-${i}`}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-zinc-100">
                          {a.reason ?? a.reason_key}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {fmtDate(a.created_at)} · {fmtTime(a.created_at)}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                        +{a.points}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
