"use client";

/**
 * components/RecentlyEarnedFeed.tsx
 * ---------------------------------------------------------------------------
 * Live "Recently Earned" feed. Polls /api/feed/recent every 60s and shows
 * the latest completions across all users with a per-row Share button
 * that opens the public share page (which has a custom OG image so the
 * link previews beautifully on X/Discord).
 * ---------------------------------------------------------------------------
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type FeedItem =
  | {
      type?: "challenge";
      flowAddress: string;
      username: string | null;
      avatarUrl: string | null;
      ruleId: string;
      reward: string;
      tsrPoints: number;
      earnedAt: string;
    }
  | {
      type: "milestone";
      flowAddress: string;
      username: string | null;
      avatarUrl: string | null;
      milestoneId: string;
      threshold: number;
      rewardLabel: string;
      bonusTsr: number;
      earnedAt: string;
    };

type Tab = "everyone" | "following";

interface Props {
  /** How many rows to display (max 50). Defaults to 12. */
  limit?: number;
  /** Compact mode: smaller paddings/text. Used inside the dashboard sidebar. */
  compact?: boolean;
  /** Optional title override. */
  title?: string;
}

const POLL_MS = 60_000;

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function RecentlyEarnedFeed({
  limit = 12,
  compact = false,
  title = "Recently Earned",
}: Props) {
  const [tab, setTab] = useState<Tab>("everyone");
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [followingCount, setFollowingCount] = useState<number>(0);
  const [signedIn, setSignedIn] = useState<boolean>(false);
  const [tick, setTick] = useState(0); // forces relativeTime to refresh

  const load = useCallback(async (which: Tab) => {
    try {
      const url =
        which === "following"
          ? `/api/feed/following?limit=${limit}`
          : `/api/feed/recent?limit=${limit}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as {
          items: FeedItem[];
          following?: number;
          viewer?: string | null;
        };
        setItems(body.items);
        if (which === "following") {
          setFollowingCount(body.following ?? 0);
          setSignedIn(!!body.viewer);
        } else if (typeof body.viewer !== "undefined") {
          setSignedIn(!!body.viewer);
        }
      }
    } catch {
      /* swallow — feed is decorative */
    }
  }, [limit]);

  // Probe sign-in state once so we know whether to show the Following tab.
  useEffect(() => {
    fetch("/api/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { address: string | null }) => setSignedIn(!!d.address))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setItems(null);
    void load(tab);
    const id = setInterval(() => load(tab), POLL_MS);
    return () => clearInterval(id);
  }, [load, tab]);

  // Tick every 30s so "Xs ago" stays accurate without a full refetch.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="glass overflow-hidden rounded-2xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
          </span>
          <h2 className="text-sm font-semibold tracking-wide text-zinc-100">
            {title}
          </h2>
        </div>

        {/* Tab pills — only show "Following" once we know the viewer is signed in */}
        {signedIn ? (
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-0.5 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setTab("everyone")}
              className={
                "rounded-full px-3 py-1 transition " +
                (tab === "everyone"
                  ? "bg-amber-400/15 text-amber-200"
                  : "text-zinc-400 hover:text-zinc-200")
              }
            >
              Everyone
            </button>
            <button
              type="button"
              onClick={() => setTab("following")}
              className={
                "rounded-full px-3 py-1 transition " +
                (tab === "following"
                  ? "bg-amber-400/15 text-amber-200"
                  : "text-zinc-400 hover:text-zinc-200")
              }
            >
              Following
            </button>
          </div>
        ) : (
          <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            Live · auto-updates
          </span>
        )}
      </header>

      {items === null ? (
        <div className="px-5 py-8 text-center text-sm text-zinc-500">
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-zinc-500">
          {tab === "following" ? (
            followingCount === 0 ? (
              <>You’re not following anyone yet. Visit a profile and tap <span className="font-semibold text-zinc-300">Follow</span> to build your feed.</>
            ) : (
              <>The collectors you follow haven’t earned anything recently.</>
            )
          ) : (
            <>No completions yet — be the first to earn a reward.</>
          )}
        </div>
      ) : (
        <ul
          className="divide-y divide-white/5"
          // tick referenced so React re-renders relative timestamps periodically
          data-tick={tick}
        >
          {items.map((it) => {
            const display = it.username ? `@${it.username}` : shortAddr(it.flowAddress);
            const isMilestone = it.type === "milestone";
            const key = isMilestone
              ? `m-${it.flowAddress}-${it.milestoneId}`
              : `c-${it.flowAddress}-${it.ruleId}`;
            const rightHref = isMilestone
              ? `/profile/${it.flowAddress}`
              : `/c/${it.flowAddress}/${encodeURIComponent(it.ruleId)}`;
            const rightLabel = isMilestone ? "View" : "Share";
            const points = isMilestone ? it.bonusTsr : it.tsrPoints;
            return (
              <li
                key={key}
                className={
                  "flex items-center gap-3 transition hover:bg-white/[0.02] " +
                  (compact ? "px-4 py-2.5" : "px-5 py-3")
                }
              >
                {/* Avatar */}
                <Link
                  href={`/profile/${it.flowAddress}`}
                  className="relative shrink-0"
                >
                  {it.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.avatarUrl}
                      alt=""
                      className={
                        "rounded-full border border-white/10 object-cover " +
                        (compact ? "h-8 w-8" : "h-10 w-10")
                      }
                    />
                  ) : (
                    <div
                      className={
                        "flex items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-300 " +
                        (compact ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm")
                      }
                    >
                      {isMilestone ? "🏆" : "🏀"}
                    </div>
                  )}
                </Link>

                {/* Body */}
                <div className="min-w-0 flex-1">
                  <p className={compact ? "text-xs" : "text-sm"}>
                    <Link
                      href={`/profile/${it.flowAddress}`}
                      className="font-semibold text-zinc-100 hover:text-amber-300"
                    >
                      {display}
                    </Link>
                    {isMilestone ? (
                      <>
                        <span className="text-zinc-400"> reached the </span>
                        <span className="font-medium text-amber-300">
                          {it.threshold.toLocaleString()} TSR
                        </span>
                        <span className="text-zinc-400"> milestone — </span>
                        <span className="font-medium text-amber-300">
                          {it.rewardLabel}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-zinc-400"> earned </span>
                        <Link
                          href={`/c/${it.flowAddress}/${encodeURIComponent(it.ruleId)}`}
                          className="font-medium text-amber-300 hover:underline"
                        >
                          {it.reward}
                        </Link>
                      </>
                    )}
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                    <span>{relativeTime(it.earnedAt)}</span>
                    {points > 0 ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="text-amber-300/80">
                          +{points.toLocaleString()} TSR
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>

                {/* Right-side action */}
                <Link
                  href={rightHref}
                  className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:border-amber-400/40 hover:bg-amber-400/10 hover:text-amber-200"
                >
                  {rightLabel}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
