"use client";

/**
 * components/LiveChallenges.tsx
 * ---------------------------------------------------------------------------
 * Client component rendered on the homepage between the hero and "How it
 * works" sections. Fetches /api/challenges/progress on mount and renders
 * a glass card with progress bars for the top 5 active challenges.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import Link from "next/link";

interface ChallengeProgress {
  id: string;
  reward: string;
  type: string;
  completed: number;
  totalUsers: number;
  pctOfUsers: number;
}

interface ApiResponse {
  totalUsers: number;
  challenges: ChallengeProgress[];
}

function typeLabel(type: string): string {
  switch (type) {
    case "specific_moments": return "Specific Moments";
    case "set_completion":   return "Set Completion";
    case "quantity":         return "Quantity";
    default:                 return type;
  }
}

export function LiveChallenges() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/challenges/progress")
      .then((r) => r.json())
      .then((d: ApiResponse) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-20">
      <div className="glass overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/5 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-2 w-2 rounded-full bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.9)]" />
            <h2 className="text-base font-semibold tracking-tight">
              Live challenges
            </h2>
          </div>
          {data && (
            <span className="text-[11px] text-zinc-500">
              {data.totalUsers.toLocaleString()} verified collectors
            </span>
          )}
        </div>

        {/* Body */}
        <div className="divide-y divide-white/5">
          {loading ? (
            // Skeleton rows
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="h-3.5 w-48 animate-pulse rounded-full bg-white/10" />
                  <div className="h-3 w-20 animate-pulse rounded-full bg-white/10" />
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-white/10" />
                </div>
              </div>
            ))
          ) : !data || data.challenges.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-zinc-500">
              No active challenges right now.
            </div>
          ) : (
            data.challenges.map((c) => (
              <div key={c.id} className="group px-6 py-4 transition hover:bg-white/[0.02]">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-100">
                      {c.reward}
                    </p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                      {typeLabel(c.type)}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-zinc-400">
                    {c.completed.toLocaleString()} collector{c.completed !== 1 ? "s" : ""} completed
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mt-2.5 flex items-center gap-3">
                  <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-700"
                      style={{ width: `${Math.max(c.pctOfUsers, c.completed > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-[10px] text-zinc-500">
                    {c.pctOfUsers.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* CTA */}
        <div className="border-t border-white/5 px-6 py-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-orange-400 transition hover:text-orange-300"
          >
            Sign in and scan to join
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 8h10" />
              <path d="m9 4 4 4-4 4" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

export default LiveChallenges;
