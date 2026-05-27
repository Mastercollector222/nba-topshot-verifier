"use client";

/**
 * DailyResetCountdown
 * ---------------------------------------------------------------------------
 * Counts down to the next UTC midnight. Used for streak and daily TSR resets.
 * Shows hours/minutes left and a contextual message about the user's streak.
 */

import { useEffect, useState, useCallback } from "react";

interface Props {
  streakDays: number;
  compact?: boolean;
}

function msToNextUtcMidnight(): number {
  const now = new Date();
  // Next midnight UTC = tomorrow at 00:00:00 UTC
  const nextMidnight = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0
  ));
  return Math.max(0, nextMidnight.getTime() - now.getTime());
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function DailyResetCountdown({ streakDays, compact = false }: Props) {
  const [msLeft, setMsLeft] = useState<number>(msToNextUtcMidnight());
  const [mounted, setMounted] = useState(false);

  const tick = useCallback(() => {
    setMsLeft(msToNextUtcMidnight());
  }, []);

  useEffect(() => {
    setMounted(true);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tick]);

  if (!mounted) return null;

  const timeStr = formatDuration(msLeft);
  const isUrgent = msLeft < 60 * 60 * 1000; // Less than 1 hour

  if (compact) {
    return (
      <div
        className={`
          inline-flex items-center gap-2 rounded-lg border px-3 py-1.5
          ${isUrgent
            ? "border-orange-400/40 bg-orange-400/10 text-orange-300"
            : "border-white/10 bg-white/5 text-zinc-400"
          }
        `}
        title="Daily actions reset at midnight UTC"
      >
        <span className="text-[10px] uppercase tracking-wider">
          {streakDays > 0 ? `Streak ends in` : `Daily reset in`}
        </span>
        <span className={`font-mono text-sm ${isUrgent ? "font-semibold" : ""}`}>
          {timeStr}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`
        rounded-xl border p-4
        ${isUrgent
          ? "border-orange-400/30 bg-gradient-to-r from-orange-500/10 to-amber-500/5"
          : "border-white/10 bg-white/[0.02]"
        }
      `}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p
            className={`
              text-[10px] font-bold uppercase tracking-widest
              ${isUrgent ? "text-orange-300" : "text-zinc-500"}
            `}
          >
            {streakDays > 0 ? "🔥 Streak expires at" : "⏰ Daily TSR reset at"}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {streakDays > 0
              ? `Check in before midnight UTC to keep your ${streakDays}-day streak alive`
              : "Complete daily actions before reset to earn TSR"}
          </p>
        </div>
        <div
          className={`
            shrink-0 rounded-lg border px-3 py-2 text-center
            ${isUrgent
              ? "border-orange-400/40 bg-orange-400/10"
              : "border-white/10 bg-black/30"
            }
          `}
        >
          <p
            className={`
              font-mono text-xl font-bold tracking-tight
              ${isUrgent ? "text-orange-300" : "text-zinc-200"}
            `}
          >
            {timeStr}
          </p>
          <p className="text-[9px] uppercase tracking-widest text-zinc-500">
            remaining
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * ChestCountdown — shows when the next daily chest will be available.
 * The chest is available once per UTC day, so this counts down to the same
 * midnight as the daily reset.
 */
export function ChestCountdown({ claimedToday }: { claimedToday: boolean }) {
  const [msLeft, setMsLeft] = useState<number>(msToNextUtcMidnight());
  const [mounted, setMounted] = useState(false);

  const tick = useCallback(() => {
    setMsLeft(msToNextUtcMidnight());
  }, []);

  useEffect(() => {
    setMounted(true);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tick]);

  if (!mounted) return null;

  const timeStr = formatDuration(msLeft);
  const isUrgent = msLeft < 60 * 60 * 1000;

  if (claimedToday) {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-emerald-300">
        <span className="text-sm">✓</span>
        <span className="text-[10px] uppercase tracking-wider">Claimed today</span>
        <span className="text-zinc-500">·</span>
        <span className="font-mono text-xs text-zinc-400">{timeStr}</span>
      </div>
    );
  }

  return (
    <div
      className={`
        inline-flex items-center gap-2 rounded-lg border px-3 py-1.5
        ${isUrgent
          ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
          : "border-white/10 bg-white/5 text-zinc-300"
        }
      `}
      title="Next chest available at midnight UTC"
    >
      <span className="text-sm">🎁</span>
      <span className="text-[10px] uppercase tracking-wider">
        {isUrgent ? "Opens in" : "Available in"}
      </span>
      <span className={`font-mono text-sm ${isUrgent ? "font-semibold" : ""}`}>
        {timeStr}
      </span>
    </div>
  );
}
