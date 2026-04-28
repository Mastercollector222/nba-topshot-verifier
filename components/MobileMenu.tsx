"use client";

/**
 * components/MobileMenu.tsx
 * ---------------------------------------------------------------------------
 * Hamburger nav for narrow viewports. Hidden on `sm:` and up — the desktop
 * nav in `SiteHeader` takes over there. Animates in as a dropdown panel
 * anchored under the header so it doesn't push content. Closes on:
 *   - link tap (handled by Next's <Link>)
 *   - Escape key
 *   - tap outside the panel
 *   - viewport resize past the `sm` breakpoint
 *
 * Pure UI — no state leaves this component.
 * ---------------------------------------------------------------------------
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";

export interface MobileNavLink {
  href: string;
  label: string;
  /** Optional Tailwind hover-color class for the active accent. */
  accent?: string;
}

interface Props {
  links: MobileNavLink[];
}

export function MobileMenu({ links }: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on Escape and on outside click. Both checks bail out cheaply when
  // the panel is closed so we don't pay listener cost in the common case.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && wrapperRef.current && !wrapperRef.current.contains(t)) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  // Auto-close when the viewport widens past the `sm` breakpoint so the
  // panel doesn't linger when the desktop nav becomes visible.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(min-width: 640px)");
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [open]);

  return (
    <div ref={wrapperRef} className="sm:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-200 transition hover:border-white/20 hover:bg-white/10"
      >
        {open ? (
          <X className="h-5 w-5" aria-hidden />
        ) : (
          <Menu className="h-5 w-5" aria-hidden />
        )}
      </button>

      {open ? (
        <div
          id="mobile-nav-panel"
          role="menu"
          // Anchored absolutely so it overlays content rather than pushing it.
          // The header itself is `sticky top-0 z-30`; this panel sits under
          // it and uses the same backdrop blur for visual continuity.
          className="absolute inset-x-0 top-full z-30 border-b border-white/5 bg-[oklch(0.08_0.008_265/0.92)] backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <ul className="mx-auto flex w-full max-w-7xl flex-col px-6 py-2">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={
                    "block py-3 text-sm font-medium uppercase tracking-[0.18em] text-zinc-200 transition " +
                    (l.accent ?? "hover:text-orange-400")
                  }
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default MobileMenu;
