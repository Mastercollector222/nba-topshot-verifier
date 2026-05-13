"use client";

/**
 * components/UserMenu.tsx
 * ---------------------------------------------------------------------------
 * Avatar dropdown for the signed-in user. Replaces the old HeaderAvatar
 * thumbnail. Click the avatar → a polished panel anchored under it opens
 * with personal destinations (Profile, Rewards) and sign-out.
 *
 * - Avatar shows a tiny 🔥 streak badge when the user has an active streak.
 * - Renders nothing when not signed in.
 * - Closes on: outside click, Escape, route change.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as fcl from "@onflow/fcl";

interface ProfileMini {
  address: string;
  avatarUrl: string | null;
  username: string | null;
  streak: number;
}

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function UserMenu() {
  const [profile, setProfile] = useState<ProfileMini | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sess = await fetch("/api/session", { cache: "no-store" });
        const { address } = (await sess.json()) as { address: string | null };
        if (!address || cancelled) return;
        const [profRes, gamiRes] = await Promise.all([
          fetch(`/api/profile/${encodeURIComponent(address)}`, { cache: "no-store" }),
          fetch("/api/me/gamification", { cache: "no-store" }),
        ]);
        const prof = profRes.ok ? ((await profRes.json()) as { avatarUrl: string | null; username: string | null }) : { avatarUrl: null, username: null };
        const gami = gamiRes.ok ? ((await gamiRes.json()) as { streak: { current: number } }) : null;
        if (!cancelled) {
          setProfile({
            address,
            avatarUrl: prof.avatarUrl ?? null,
            username: prof.username ?? null,
            streak: gami?.streak.current ?? 0,
          });
        }
      } catch {
        /* tolerated */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && wrapRef.current && !wrapRef.current.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSignOut = useCallback(() => {
    setOpen(false);
    try {
      fcl.unauthenticate();
    } catch {
      /* tolerated */
    }
  }, []);

  if (!profile) return null;

  const initials = (profile.username ?? profile.address).slice(0, 2).toUpperCase();
  const hasStreak = profile.streak > 0;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="User menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="group relative flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 pl-1 pr-2 transition hover:border-white/20 hover:bg-white/10"
      >
        <span className="relative block h-6 w-6 shrink-0 overflow-hidden rounded-full ring-1 ring-white/20">
          {profile.avatarUrl ? (
            <Image
              src={profile.avatarUrl}
              alt={profile.username ?? "Your avatar"}
              width={24}
              height={24}
              className="h-6 w-6 object-cover"
            />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center bg-gradient-to-br from-orange-500 to-amber-400 text-[9px] font-bold text-black">
              {initials}
            </span>
          )}
          {hasStreak && (
            <span
              aria-hidden
              className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-orange-500 text-[8px] font-bold text-white shadow-[0_0_4px_rgba(251,113,38,0.8)]"
              title={`${profile.streak}-day streak`}
            >
              🔥
            </span>
          )}
        </span>
        <svg
          viewBox="0 0 20 20"
          aria-hidden
          className={
            "h-3 w-3 text-zinc-400 transition-transform " +
            (open ? "rotate-180" : "")
          }
          fill="currentColor"
        >
          <path d="M5.5 7.5l4.5 4.5 4.5-4.5z" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          // Mobile: fixed to viewport (avoids being clipped by the cluttered
          // mobile header). Desktop (sm+): absolute below the trigger button.
          className="fixed right-3 top-[3.75rem] z-40 w-[min(20rem,calc(100vw-1.5rem))] origin-top-right overflow-hidden rounded-xl border border-white/10 bg-[oklch(0.10_0.010_265/0.96)] shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-1 duration-150 sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-64"
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
            <span className="block h-10 w-10 shrink-0 overflow-hidden rounded-full ring-1 ring-white/20">
              {profile.avatarUrl ? (
                <Image
                  src={profile.avatarUrl}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center bg-gradient-to-br from-orange-500 to-amber-400 text-sm font-bold text-black">
                  {initials}
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-zinc-100">
                {profile.username ?? "Anonymous"}
              </p>
              <p className="truncate font-mono text-[11px] text-zinc-500">
                {short(profile.address)}
              </p>
            </div>
          </div>

          {/* Streak banner */}
          {hasStreak && (
            <Link
              href="/rewards"
              role="menuitem"
              className="flex items-center justify-between gap-2 border-b border-white/5 bg-gradient-to-r from-orange-500/10 to-amber-500/10 px-4 py-2.5 text-xs transition hover:from-orange-500/15 hover:to-amber-500/15"
            >
              <span className="text-zinc-300">
                🔥 <span className="font-semibold text-zinc-100">{profile.streak}-day</span> login streak
              </span>
              <span className="text-[10px] text-amber-300">View</span>
            </Link>
          )}

          {/* Items */}
          <nav className="py-1">
            <MenuLink href={`/profile/${profile.address}`} icon={<UserIcon />}>
              My Profile
            </MenuLink>
            <MenuLink href="/rewards" icon={<TrophyIcon />}>
              Rewards & Streaks
            </MenuLink>
            <MenuLink href="/messages" icon={<MessagesIcon />}>
              Messages
            </MenuLink>
            <MenuLink href="/notifications" icon={<BellIcon />}>
              Notifications
            </MenuLink>
          </nav>

          <div className="border-t border-white/5 py-1">
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-red-300 transition hover:bg-red-400/5 hover:text-red-200"
            >
              <SignOutIcon />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex items-center gap-3 px-4 py-2 text-sm text-zinc-200 transition hover:bg-white/5 hover:text-white"
    >
      <span className="text-zinc-500">{icon}</span>
      <span>{children}</span>
    </Link>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function MessagesIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export default UserMenu;
