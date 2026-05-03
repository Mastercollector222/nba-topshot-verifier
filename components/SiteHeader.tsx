/**
 * components/SiteHeader.tsx
 * ---------------------------------------------------------------------------
 * Shared premium chrome for every page. Keeps the look consistent across
 * `/`, `/dashboard`, and `/admin` without duplicating styles. Purely visual;
 * it contains no application state.
 * ---------------------------------------------------------------------------
 */

import Link from "next/link";
import { ConnectWallet } from "@/components/ConnectWallet";
import { MobileMenu, type MobileNavLink } from "@/components/MobileMenu";

interface Props {
  /** Small kicker shown under the brand wordmark (e.g. "Dashboard"). */
  subtitle?: string;
  /** If true, renders the "Admin" link on the right. Default: false. */
  showAdminLink?: boolean;
  /** If true, renders the Connect Wallet control. Default: true. */
  showWallet?: boolean;
}

// Single source of truth for top-nav links. Desktop renders these inline
// in the header; mobile renders them inside the hamburger panel.
const BASE_LINKS: MobileNavLink[] = [
  { href: "/dashboard", label: "Dashboard", accent: "hover:text-orange-400" },
  { href: "/leaderboard", label: "Leaderboard", accent: "hover:text-amber-300" },
  { href: "/treasure-hunt", label: "Treasure", accent: "hover:text-amber-300" },
  { href: "/profile", label: "Profile", accent: "hover:text-amber-300" },
];

export function SiteHeader({
  subtitle,
  showAdminLink = false,
  showWallet = true,
}: Props) {
  const links = BASE_LINKS;

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[oklch(0.08_0.008_265/0.7)] backdrop-blur-md">
      <div className="relative mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <Link href="/" className="group flex min-w-0 items-center gap-3">
          {/* Flame logo tile. Sweep animation comes from `.sweep` in globals.css. */}
          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-orange-400 via-orange-500 to-red-600 shadow-[0_6px_24px_-6px_rgba(251,113,38,0.7)] sweep">
            <div className="absolute inset-[2px] rounded-[7px] bg-gradient-to-br from-orange-500/70 to-red-700/70" />
            <svg
              viewBox="0 0 24 24"
              className="absolute inset-0 m-auto h-5 w-5 text-black/80"
              fill="currentColor"
              aria-hidden
            >
              <path d="M12 2c1.8 3.6 4 5.2 4 8.2 0 2.2-1.4 3.8-3 3.8 0-1.6-.8-3-2-4-.6 2-2 3-2 5 0 2.8 2.2 5 5 5s5-2.2 5-5c0-5.6-5-8-7-13Z" />
            </svg>
          </div>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold tracking-tight text-zinc-100">
              Top Shot Verifier
            </span>
            <span className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
              {subtitle ?? "Flow Mainnet"}
            </span>
          </div>
        </Link>

        {/* Desktop nav (>= sm). Hidden on mobile in favor of <MobileMenu>. */}
        <nav className="hidden items-center gap-5 sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={
                "text-xs font-medium uppercase tracking-[0.18em] text-zinc-300 transition " +
                (l.accent ?? "hover:text-orange-400")
              }
            >
              {l.label}
            </Link>
          ))}
          {showWallet ? <ConnectWallet /> : null}
        </nav>

        {/* Mobile cluster: wallet (compact) + hamburger. Wallet stays
            visible because it's the primary CTA on every page. */}
        <div className="flex items-center gap-2 sm:hidden">
          {showWallet ? <ConnectWallet /> : null}
          <MobileMenu links={links} />
        </div>
      </div>
    </header>
  );
}

export default SiteHeader;
