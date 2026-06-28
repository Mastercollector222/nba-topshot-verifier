"use client";

/**
 * components/NavPlayMenu.tsx
 * ---------------------------------------------------------------------------
 * Desktop-only "Play" dropdown. Collapses the five game/crafting sections
 * (Test Your Stack, Battles, Treasure Hunt, Forge, Mint) into one grouped
 * menu so the top bar stays uncluttered.
 *
 * - Opens on click, closes on outside click / Escape / route change.
 * - Highlights when the current route is one of the Play destinations.
 * - Reads its items from the shared `lib/nav` config.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PLAY_LINKS, isPlayActive } from "@/lib/nav";

export function NavPlayMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const active = isPlayActive(pathname);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on outside click + Escape.
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

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={
          "flex items-center gap-1 text-xs font-medium uppercase tracking-[0.18em] transition hover:text-orange-400 " +
          (active || open ? "text-orange-400" : "text-zinc-300")
        }
      >
        Play
        <svg
          viewBox="0 0 20 20"
          aria-hidden
          className={"h-3 w-3 transition-transform " + (open ? "rotate-180" : "")}
          fill="currentColor"
        >
          <path d="M5.5 7.5l4.5 4.5 4.5-4.5z" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-1/2 top-full z-40 mt-3 w-80 -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-[oklch(0.10_0.010_265/0.97)] shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="border-b border-white/5 px-4 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Games & Crafting
            </span>
          </div>
          <nav className="p-1.5">
            {PLAY_LINKS.map((l) => {
              const Icon = l.icon;
              const isCurrent =
                pathname === l.href || pathname.startsWith(l.href + "/");
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  role="menuitem"
                  className={
                    "group flex items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/[0.06] " +
                    (isCurrent ? "bg-white/[0.04]" : "")
                  }
                >
                  <span
                    className={
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10 " +
                      l.accent
                    }
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-zinc-100">
                      {l.label}
                    </span>
                    <span className="block text-xs leading-snug text-zinc-500">
                      {l.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}
    </div>
  );
}

export default NavPlayMenu;
