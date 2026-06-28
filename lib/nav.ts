/**
 * lib/nav.ts
 * ---------------------------------------------------------------------------
 * Single source of truth for the site's navigation groups. Both the desktop
 * header (`NavPlayMenu`) and the mobile bottom nav (`MobileBottomNav`) read
 * from these arrays so the two surfaces never drift apart.
 *
 * Icons are `lucide-react` component *references* (not rendered here), so this
 * stays a plain `.ts` module with no JSX.
 * ---------------------------------------------------------------------------
 */

import {
  Swords,
  Compass,
  Flame,
  Sparkles,
  Target,
  Trophy,
  Dna,
  Medal,
  User,
  MessageSquare,
  Bell,
  type LucideIcon,
} from "lucide-react";

export interface NavEntry {
  href: string;
  label: string;
  /** One-line description shown in dropdowns / sheets. */
  description: string;
  icon: LucideIcon;
  /** Tailwind text-color class used for the icon accent. */
  accent: string;
}

/** Games & crafting — the "Play" group. */
export const PLAY_LINKS: NavEntry[] = [
  {
    href: "/test-your-stack",
    label: "Test Your Stack",
    description: "Score your collection against weekly challenges",
    icon: Target,
    accent: "text-fuchsia-300",
  },
  {
    href: "/battles",
    label: "Battles",
    description: "Go head-to-head with other collectors",
    icon: Swords,
    accent: "text-red-400",
  },
  {
    href: "/treasure-hunt",
    label: "Treasure Hunt",
    description: "Solve clues to unlock hidden rewards",
    icon: Compass,
    accent: "text-amber-300",
  },
  {
    href: "/forge",
    label: "Forge",
    description: "Burn moments to craft exclusive rewards",
    icon: Flame,
    accent: "text-orange-300",
  },
  {
    href: "/mint",
    label: "Mint",
    description: "Claim and mint community drops",
    icon: Sparkles,
    accent: "text-yellow-300",
  },
];

/** Progress & account destinations — the mobile "More" group. */
export const MORE_LINKS: NavEntry[] = [
  {
    href: "/milestones",
    label: "Milestones",
    description: "Track reward tiers and claim airdrops",
    icon: Medal,
    accent: "text-emerald-300",
  },
  {
    href: "/rewards",
    label: "Rewards & Streaks",
    description: "Your TSR points, streaks and daily actions",
    icon: Trophy,
    accent: "text-amber-300",
  },
  {
    href: "/dna",
    label: "Stack DNA",
    description: "Visualize the makeup of your collection",
    icon: Dna,
    accent: "text-cyan-300",
  },
];

/** Communication destinations (carry unread badges). */
export const COMM_LINKS: Array<NavEntry & { kind: "messages" | "notifications" }> = [
  {
    href: "/messages",
    label: "Messages",
    description: "Direct messages with other collectors",
    icon: MessageSquare,
    accent: "text-sky-300",
    kind: "messages",
  },
  {
    href: "/notifications",
    label: "Notifications",
    description: "Badges, ranks and admin announcements",
    icon: Bell,
    accent: "text-orange-300",
    kind: "notifications",
  },
];

/** True when the current pathname belongs to the Play group. */
export function isPlayActive(pathname: string): boolean {
  return PLAY_LINKS.some(
    (l) => pathname === l.href || pathname.startsWith(l.href + "/"),
  );
}

export { User };
