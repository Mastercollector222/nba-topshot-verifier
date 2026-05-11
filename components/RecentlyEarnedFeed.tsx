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

interface FeedItem {
  flowAddress: string;
  username: string | null;
  avatarUrl: string | null;
  ruleId: string;
  reward: string;
  tsrPoints: number;
  earnedAt: string;
}

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
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [tick, setTick] = useState(0); // forces relativeTime to refresh

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/feed/recent?limit=${limit}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const body = (await res.json()) as { items: FeedItem[] };
        setItems(body.items);
      }
    } catch {
      /* swallow — feed is decorative */
    }
  }, [limit]);

  useEffect(() => {
    void load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Tick every 30s so "Xs ago" stays accurate without a full refetch.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="glass overflow-hidden rounded-2xl">
      <header className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
          </span>
          <h2 className="text-sm font-semibold tracking-wide text-zinc-100">
            {title}
          </h2>
        </div>
        <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          Live · auto-updates
        </span>
      </header>

      {items === null ? (
        <div className="px-5 py-8 text-center text-sm text-zinc-500">
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-zinc-500">
          No completions yet — be the first to earn a reward.
        </div>
      ) : (
        <ul
          className="divide-y divide-white/5"
          // tick referenced so React re-renders relative timestamps periodically
          data-tick={tick}
        >
          {items.map((it) => {
            const display = it.username ? `@${it.username}` : shortAddr(it.flowAddress);
            const sharePath = `/c/${it.flowAddress}/${encodeURIComponent(it.ruleId)}`;
            return (
              <li
                key={`${it.flowAddress}-${it.ruleId}`}
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
                      🏀
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
                    <span className="text-zinc-400"> earned </span>
                    <Link
                      href={sharePath}
                      className="font-medium text-amber-300 hover:underline"
                    >
                      {it.reward}
                    </Link>
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                    <span>{relativeTime(it.earnedAt)}</span>
                    {it.tsrPoints > 0 ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="text-amber-300/80">
                          +{it.tsrPoints.toLocaleString()} TSR
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>

                {/* Share */}
                <Link
                  href={sharePath}
                  className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:border-amber-400/40 hover:bg-amber-400/10 hover:text-amber-200"
                >
                  Share
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
