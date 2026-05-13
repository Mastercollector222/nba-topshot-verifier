/**
 * lib/tiers.ts
 * ---------------------------------------------------------------------------
 * Profile customization tiers based on lifetime TSR balance.
 *
 * The tier itself is NOT stored on the user row — it's derived from the
 * user's TSR total at request time. This means tier transitions are
 * automatic and cannot drift. The columns `accent_color` and `banner_url`
 * on `public.users` hold the customization values; this module decides
 * whether a particular user is allowed to set them right now.
 *
 * Tiers (current thresholds):
 *   Bronze   0 – 999      default look
 *   Silver   1k – 4.9k    + accent color picker
 *   Gold     5k – 24.9k   + banner image
 *   Diamond  25k+         + animated avatar border + verified ✓ badge
 *
 * Customization values previously set are NEVER auto-cleared if a user
 * drops below the tier threshold — they're just hidden from the editor
 * until the user climbs back. This avoids a frustrating "I lost my
 * banner overnight" UX during normal TSR fluctuation.
 * ---------------------------------------------------------------------------
 */

export type TierId = "bronze" | "silver" | "gold" | "diamond";

export interface TierDef {
  id: TierId;
  name: string;
  /** Inclusive minimum TSR to be in this tier. */
  minTsr: number;
  /** Hex color used for badges + accents in tier UI. */
  themeColor: string;
  /** One-line description of what unlocks at this tier. */
  perk: string;
}

export const TIERS: ReadonlyArray<TierDef> = [
  {
    id: "bronze",
    name: "Bronze",
    minTsr: 0,
    themeColor: "#a78a6a",
    perk: "Default profile look",
  },
  {
    id: "silver",
    name: "Silver",
    minTsr: 1000,
    themeColor: "#c0c0c0",
    perk: "Custom accent color",
  },
  {
    id: "gold",
    name: "Gold",
    minTsr: 5000,
    themeColor: "#ffb84d",
    perk: "Profile banner image",
  },
  {
    id: "diamond",
    name: "Diamond",
    minTsr: 25000,
    themeColor: "#7dd3fc",
    perk: "Animated border + verified badge",
  },
];

/** Curated palette for the Silver+ accent color picker. Chosen for
 * legibility on the dark theme; clients can pick from this list only. */
export const ACCENT_PALETTE: ReadonlyArray<{ hex: string; name: string }> = [
  { hex: "#fb7126", name: "Flame" },
  { hex: "#f59e0b", name: "Amber" },
  { hex: "#22c55e", name: "Emerald" },
  { hex: "#06b6d4", name: "Cyan" },
  { hex: "#3b82f6", name: "Azure" },
  { hex: "#a855f7", name: "Violet" },
  { hex: "#ec4899", name: "Magenta" },
  { hex: "#ef4444", name: "Crimson" },
];

/** Resolve a TSR balance to its tier. Falls back to Bronze for negative or
 * NaN inputs. */
export function getTier(tsrTotal: number): TierDef {
  const safe = Number.isFinite(tsrTotal) ? Math.max(0, Math.floor(tsrTotal)) : 0;
  let current: TierDef = TIERS[0];
  for (const t of TIERS) {
    if (safe >= t.minTsr) current = t;
  }
  return current;
}

/** Returns the next tier above the user's current one, or null if Diamond. */
export function nextTier(current: TierId): TierDef | null {
  const idx = TIERS.findIndex((t) => t.id === current);
  if (idx < 0 || idx >= TIERS.length - 1) return null;
  return TIERS[idx + 1];
}

/** Permission helpers — single source of truth for what each tier unlocks. */
export const canCustomizeAccent = (tier: TierId): boolean =>
  tier === "silver" || tier === "gold" || tier === "diamond";

export const canSetBanner = (tier: TierId): boolean =>
  tier === "gold" || tier === "diamond";

export const hasVerifiedBadge = (tier: TierId): boolean => tier === "diamond";
export const hasAnimatedBorder = (tier: TierId): boolean => tier === "diamond";

/** Normalise an accent color: must be one of the palette hexes. Case
 * insensitive on input, normalised to lowercase. Returns null if invalid. */
export function validateAccent(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const lower = raw.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(lower)) return null;
  return ACCENT_PALETTE.some((p) => p.hex.toLowerCase() === lower) ? lower : null;
}

/** Banner URLs reuse the avatar host whitelist. Kept here so callers can
 * import a single tier-related helper. */
const ALLOWED_BANNER_HOSTS = [
  "i.imgur.com",
  "imgur.com",
  "res.cloudinary.com",
  "cdn.discordapp.com",
  "raw.githubusercontent.com",
  "user-images.githubusercontent.com",
];

export function isAllowedBannerUrl(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    if (u.pathname.length > 2048) return false;
    return ALLOWED_BANNER_HOSTS.some(
      (h) => u.hostname === h || u.hostname.endsWith(`.${h}`),
    );
  } catch {
    return false;
  }
}
