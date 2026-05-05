"use client";

/**
 * components/KeyboardShortcuts.tsx
 * ---------------------------------------------------------------------------
 * Global keyboard shortcut handler + help overlay.
 *
 * Shortcuts:
 *   ?       — open/close help overlay
 *   Escape  — close help overlay
 *   G then D — navigate to /dashboard
 *   G then L — navigate to /leaderboard
 *   G then P — navigate to /profile
 *   G then T — navigate to /treasure-hunt
 *   /       — focus the UserSearch input in the header
 *
 * Skips all shortcuts when focus is inside an <input>, <textarea>, or
 * [contenteditable] so users can type freely in forms.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const GOTO: Record<string, string> = {
  d: "/dashboard",
  l: "/leaderboard",
  p: "/profile",
  t: "/treasure-hunt",
};

function isTyping(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    (el as HTMLElement).isContentEditable
  );
}

interface Row {
  keys: string;
  description: string;
}

const ROWS: Row[] = [
  { keys: "⌘K", description: "Open command palette" },
  { keys: "G  D", description: "Go to Dashboard" },
  { keys: "G  L", description: "Go to Leaderboard" },
  { keys: "G  P", description: "Go to Profile" },
  { keys: "G  T", description: "Go to Treasure Hunt" },
  { keys: "/", description: "Focus search" },
  { keys: "?", description: "Toggle this overlay" },
  { keys: "Esc", description: "Close overlay" },
];

export function KeyboardShortcuts() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const gPending = useRef(false);
  const gTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Never intercept shortcuts inside form fields.
      if (isTyping() && e.key !== "Escape") return;

      // Escape always closes the overlay.
      if (e.key === "Escape") {
        if (open) { setOpen(false); return; }
      }

      // "/" — focus the search input in the header.
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(
          "nav input[type='text']",
        );
        if (input) { input.focus(); input.select(); }
        return;
      }

      // "?" — toggle overlay.
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }

      // "G" — arm the chord; wait for second key within 1.5 s.
      if (e.key.toLowerCase() === "g" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        gPending.current = true;
        if (gTimer.current) clearTimeout(gTimer.current);
        gTimer.current = setTimeout(() => { gPending.current = false; }, 1500);
        return;
      }

      // Second key of G+<x> chord.
      if (gPending.current) {
        gPending.current = false;
        if (gTimer.current) clearTimeout(gTimer.current);
        const dest = GOTO[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          setOpen(false);
          router.push(dest);
        }
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, router]);

  if (!open) return null;

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      onClick={close}
    >
      {/* Blurred dark overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Card */}
      <div
        className="glass-strong relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Keyboard shortcuts
          </span>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded-full p-1 text-zinc-500 transition hover:bg-white/10 hover:text-zinc-200"
          >
            {/* ✕ */}
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Rows */}
        <ul className="divide-y divide-white/5 px-5 py-2">
          {ROWS.map((row) => (
            <li key={row.keys} className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-xs text-zinc-300">{row.description}</span>
              <span className="flex shrink-0 items-center gap-1">
                {row.keys.split("  ").map((k, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && (
                      <span className="text-[10px] text-zinc-600">then</span>
                    )}
                    <kbd className="inline-flex items-center rounded border border-white/20 bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">
                      {k}
                    </kbd>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>

        {/* Footer hint */}
        <div className="border-t border-white/5 px-5 py-3 text-center text-[10px] text-zinc-600">
          Press <kbd className="rounded border border-white/10 bg-white/5 px-1 font-mono text-[10px]">?</kbd> to toggle
        </div>
      </div>
    </div>
  );
}

export default KeyboardShortcuts;
