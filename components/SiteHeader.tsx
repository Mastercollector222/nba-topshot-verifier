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

interface Props {
  /** Small kicker shown under the brand wordmark (e.g. "Dashboard"). */
  subtitle?: string;
  /** If true, renders the "Admin" link on the right. Default: true. */
  showAdminLink?: boolean;
  /** If true, renders the Connect Wallet control. Default: true. */
  showWallet?: boolean;
}

export function SiteHeader({
  subtitle,
  showAdminLink = true,
  showWallet = true,
}: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[oklch(0.08_0.008_265/0.7)] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="group flex items-center gap-3">
          {/* Flame logo tile. Sweep animation comes from `.sweep` in globals.css. */}
          <div className="relative h-9 w-9 overflow-hidden rounded-lg bg-gradient-to-br from-orange-400 via-orange-500 to-red-600 shadow-[0_6px_24px_-6px_rgba(251,113,38,0.7)] sweep">
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
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight text-zinc-100">
              Top Shot Verifier
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
              {subtitle ?? "Flow Mainnet"}
            </span>
          </div>
        </Link>
        <nav className="flex items-center gap-5">
          <Link
            href="/dashboard"
            className="hidden text-xs font-medium uppercase tracking-[0.18em] text-zinc-300 transition hover:text-orange-400 sm:inline"
          >
            Dashboard
          </Link>
          <Link
            href="/leaderboard"
            className="hidden text-xs font-medium uppercase tracking-[0.18em] text-zinc-300 transition hover:text-amber-300 sm:inline"
          >
            Leaderboard
          </Link>
          {showAdminLink ? (
            <Link
              href="/admin"
              className="hidden text-xs font-medium uppercase tracking-[0.18em] text-zinc-300 transition hover:text-orange-400 sm:inline"
            >
              Admin
            </Link>
          ) : null}
          {showWallet ? <ConnectWallet /> : null}
        </nav>
      </div>
    </header>
  );
}

export default SiteHeader;
