/**
 * components/TierBadge.tsx
 * ---------------------------------------------------------------------------
 * Small chip that displays a user's profile tier (Bronze / Silver / Gold /
 * Diamond) with a tier-themed gradient border. Pure presentational — the
 * tier is computed server-side from the user's TSR balance and passed in.
 * ---------------------------------------------------------------------------
 */

import type { TierId } from "@/lib/tiers";

const TIER_STYLES: Record<TierId, { bg: string; text: string; ring: string; label: string }> = {
  bronze: {
    bg: "bg-gradient-to-r from-amber-700/20 to-amber-900/20",
    text: "text-amber-300",
    ring: "ring-amber-700/40",
    label: "Bronze",
  },
  silver: {
    bg: "bg-gradient-to-r from-zinc-300/20 to-zinc-500/20",
    text: "text-zinc-200",
    ring: "ring-zinc-400/40",
    label: "Silver",
  },
  gold: {
    bg: "bg-gradient-to-r from-amber-300/25 to-yellow-500/20",
    text: "text-amber-200",
    ring: "ring-amber-400/50",
    label: "Gold",
  },
  diamond: {
    bg: "bg-gradient-to-r from-sky-300/25 via-cyan-300/20 to-fuchsia-300/20",
    text: "text-sky-200",
    ring: "ring-sky-300/50",
    label: "Diamond",
  },
};

export function TierBadge({ tier, className = "" }: { tier: TierId; className?: string }) {
  const s = TIER_STYLES[tier];
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ring-1 " +
        s.bg +
        " " +
        s.text +
        " " +
        s.ring +
        " " +
        className
      }
    >
      <span aria-hidden>
        {tier === "diamond" ? "💎" : tier === "gold" ? "🏆" : tier === "silver" ? "⚪" : "🟫"}
      </span>
      {s.label}
    </span>
  );
}

export default TierBadge;
