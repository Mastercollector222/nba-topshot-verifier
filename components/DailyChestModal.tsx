"use client";

/**
 * components/DailyChestModal.tsx
 * ---------------------------------------------------------------------------
 * Celebratory reveal for the daily login chest. The TSR award has already
 * been credited server-side by the time this modal opens — this is purely
 * a delightful UI moment so the user feels the dopamine hit.
 *
 * Lifecycle:
 *   - Opens with a closed chest icon and a "Tap to open" prompt
 *   - Click (or 1.5s auto-timer) triggers the open animation
 *   - Reveals rarity color + TSR amount with a slight bounce
 *   - User dismisses via the close button or backdrop click
 *
 * Per-day idempotency is enforced server-side; the dashboard only opens
 * this modal when the heartbeat returns a non-null `chest` field.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState } from "react";

export type ChestRarity = "common" | "uncommon" | "rare" | "epic" | "jackpot";

export interface ChestData {
  rarity: ChestRarity;
  points: number;
  basePoints: number;
  multiplier: number;
  date: string;
}

interface RarityStyle {
  label: string;
  /** Tailwind classes for the rarity ribbon. */
  ribbon: string;
  /** Tailwind classes for the rarity glow ring. */
  glow: string;
  /** Inline gradient used on the chest body. */
  chestGradient: string;
  /** Border / accent color for the points number. */
  pointsColor: string;
  /** Whether to render the extra sparkle layer. */
  sparkle: boolean;
}

const STYLES: Record<ChestRarity, RarityStyle> = {
  common: {
    label: "Common",
    ribbon: "bg-zinc-500/30 text-zinc-200 ring-zinc-400/40",
    glow: "shadow-[0_0_60px_-10px_rgba(161,161,170,0.6)]",
    chestGradient: "linear-gradient(135deg, #71717a, #3f3f46)",
    pointsColor: "text-zinc-100",
    sparkle: false,
  },
  uncommon: {
    label: "Uncommon",
    ribbon: "bg-emerald-500/25 text-emerald-200 ring-emerald-400/40",
    glow: "shadow-[0_0_70px_-10px_rgba(52,211,153,0.7)]",
    chestGradient: "linear-gradient(135deg, #10b981, #047857)",
    pointsColor: "text-emerald-200",
    sparkle: false,
  },
  rare: {
    label: "Rare",
    ribbon: "bg-sky-500/25 text-sky-200 ring-sky-400/40",
    glow: "shadow-[0_0_80px_-10px_rgba(56,189,248,0.8)]",
    chestGradient: "linear-gradient(135deg, #0ea5e9, #1d4ed8)",
    pointsColor: "text-sky-200",
    sparkle: true,
  },
  epic: {
    label: "Epic",
    ribbon: "bg-fuchsia-500/25 text-fuchsia-200 ring-fuchsia-400/50",
    glow: "shadow-[0_0_90px_-10px_rgba(217,70,239,0.85)]",
    chestGradient: "linear-gradient(135deg, #d946ef, #7c3aed)",
    pointsColor: "text-fuchsia-200",
    sparkle: true,
  },
  jackpot: {
    label: "Jackpot!",
    ribbon: "bg-amber-400/35 text-amber-100 ring-amber-300/60",
    glow: "shadow-[0_0_120px_-10px_rgba(251,191,36,0.95)]",
    chestGradient: "linear-gradient(135deg, #fcd34d, #f59e0b 50%, #b45309)",
    pointsColor: "text-amber-200",
    sparkle: true,
  },
};

export function DailyChestModal({
  chest,
  onClose,
}: {
  chest: ChestData;
  onClose: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // Auto-open after a brief beat so the user has time to register the chest
  // before the reward shows. Gives the click-to-open flow a nice rhythm.
  useEffect(() => {
    const t = window.setTimeout(() => setOpened(true), 1400);
    return () => window.clearTimeout(t);
  }, []);

  // Stagger the reward number so the chest "open" animation finishes first.
  useEffect(() => {
    if (!opened) return;
    const t = window.setTimeout(() => setRevealed(true), 600);
    return () => window.clearTimeout(t);
  }, [opened]);

  // Esc to dismiss.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const style = STYLES[chest.rarity];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Daily reward chest"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 motion-safe:animate-[fadeIn_0.25s_ease-out]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Sparkles for high rarity */}
      {style.sparkle && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 18 }).map((_, i) => (
            <span
              key={i}
              className="absolute h-1.5 w-1.5 rounded-full bg-white/80 motion-safe:animate-[sparkle_2.5s_ease-in-out_infinite]"
              style={{
                top: `${(i * 53) % 100}%`,
                left: `${(i * 71) % 100}%`,
                animationDelay: `${(i % 6) * 0.3}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Card */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={
          "relative z-10 w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/95 p-8 text-center motion-safe:animate-[popIn_0.3s_cubic-bezier(0.34,1.56,0.64,1)] " +
          style.glow
        }
      >
        {/* Header */}
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
          Daily reward
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          {opened ? "You opened today's chest!" : "Tap the chest to open it"}
        </p>

        {/* Chest visual */}
        <button
          type="button"
          onClick={() => setOpened(true)}
          disabled={opened}
          className="mx-auto my-6 block disabled:cursor-default"
          aria-label="Open chest"
        >
          <div
            className={
              "relative mx-auto h-32 w-32 rounded-2xl transition-all duration-500 " +
              (opened ? "scale-110 motion-safe:animate-[chestShake_0.4s_ease-out]" : "motion-safe:animate-[chestBob_2s_ease-in-out_infinite] hover:scale-105")
            }
            style={{ background: style.chestGradient }}
          >
            {/* Chest lid */}
            <div
              className="absolute inset-x-2 top-2 h-12 rounded-t-xl border-b border-black/30 transition-transform duration-500"
              style={{
                background: style.chestGradient,
                filter: "brightness(1.15)",
                transformOrigin: "bottom center",
                transform: opened ? "rotateX(-110deg) translateY(-4px)" : "rotateX(0)",
              }}
            />
            {/* Lock band */}
            <div className="absolute left-1/2 top-12 h-3 w-8 -translate-x-1/2 rounded bg-black/40" />
            {/* Chest body shading */}
            <div
              aria-hidden
              className="absolute inset-x-2 bottom-2 top-14 rounded-b-xl"
              style={{
                background: style.chestGradient,
                filter: "brightness(0.85)",
                boxShadow: "inset 0 4px 8px rgba(0,0,0,0.4)",
              }}
            />
            {/* Inner glow on open */}
            {opened && (
              <div
                aria-hidden
                className="absolute inset-x-3 bottom-3 top-14 rounded-b-xl bg-gradient-to-t from-amber-200/20 via-amber-100/40 to-white/80 motion-safe:animate-[innerGlow_1s_ease-out]"
              />
            )}
          </div>
        </button>

        {/* Reward reveal */}
        <div
          className={
            "transition-all duration-500 " +
            (revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0")
          }
        >
          <span
            className={
              "inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ring-1 " +
              style.ribbon
            }
          >
            {style.label}
          </span>
          <p className={"mt-3 text-5xl font-bold tracking-tight " + style.pointsColor}>
            +{chest.points.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-zinc-500">TSR points credited</p>
          {chest.multiplier > 1 && (
            <p className="mt-2 text-[11px] text-zinc-400">
              <span className="text-zinc-500">{chest.basePoints} base</span>
              <span className="mx-1.5 text-zinc-600">·</span>
              <span className="text-amber-300">×{chest.multiplier.toFixed(2)}</span>
              <span className="ml-1 text-zinc-500">streak bonus</span>
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className={
            "mt-6 w-full rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 " +
            (revealed ? "opacity-100" : "pointer-events-none opacity-0")
          }
        >
          Awesome
        </button>
        <p className="mt-3 text-[10px] text-zinc-600">Come back tomorrow for another chest</p>
      </div>

      {/* Local keyframes — tiny enough to inline; avoids polluting globals.css */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes chestBob {
          0%, 100% { transform: translateY(0) }
          50%      { transform: translateY(-6px) }
        }
        @keyframes chestShake {
          0%, 100% { transform: scale(1.1) translateX(0) }
          25%      { transform: scale(1.1) translateX(-4px) }
          75%      { transform: scale(1.1) translateX(4px) }
        }
        @keyframes innerGlow {
          from { opacity: 0; transform: scaleY(0.4) }
          to   { opacity: 1; transform: scaleY(1) }
        }
        @keyframes sparkle {
          0%, 100% { opacity: 0; transform: scale(0.5) }
          50%      { opacity: 1; transform: scale(1.2) }
        }
      `}</style>
    </div>
  );
}

export default DailyChestModal;
