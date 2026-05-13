"use client";

/**
 * components/EmailPromptBanner.tsx
 * ---------------------------------------------------------------------------
 * Dashboard-only nudge to capture an email for challenge announcements.
 *
 * Show conditions (all must be true):
 *   - User is signed in (caller passes address)
 *   - Has NOT already verified an email
 *   - Has NOT dismissed the banner this session (localStorage)
 *
 * Renders an inline single-field form so users can subscribe without
 * leaving the dashboard. After success, the banner switches to a
 * "Check your inbox" confirmation that auto-hides after 8s.
 *
 * The longer settings flow (toggle, change, unsubscribe) lives at
 * /notifications — there's a "Manage" link for power users.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "email-prompt-dismissed";

interface Prefs {
  email: string | null;
  verifiedAt: string | null;
  pendingEmail: string | null;
}

type View = "loading" | "hidden" | "form" | "pending" | "submitted";

export function EmailPromptBanner() {
  const [view, setView] = useState<View>("loading");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Decide initial visibility once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Respect the user's dismissal across reloads (per-browser).
      if (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) {
        if (!cancelled) setView("hidden");
        return;
      }
      try {
        const res = await fetch("/api/me/email/preferences", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setView("hidden"); // not signed in or error → don't nag
          return;
        }
        const data = (await res.json()) as Prefs;
        if (cancelled) return;
        if (data.verifiedAt && data.email) {
          setView("hidden"); // already subscribed
        } else if (data.pendingEmail) {
          setPendingEmail(data.pendingEmail);
          setView("pending");
        } else {
          setView("form");
        }
      } catch {
        if (!cancelled) setView("hidden");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* tolerated */
    }
    setView("hidden");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/email/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: input.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setPendingEmail(input.trim().toLowerCase());
      setView("submitted");
      // Auto-hide after a beat so the dashboard isn't permanently noisy.
      setTimeout(() => setView("hidden"), 8000);
    } finally {
      setBusy(false);
    }
  }

  if (view === "loading" || view === "hidden") return null;

  return (
    <div
      role="banner"
      className="relative flex flex-col gap-3 rounded-xl border border-orange-400/20 bg-gradient-to-r from-orange-500/[0.08] via-amber-500/[0.05] to-transparent p-4 sm:flex-row sm:items-center sm:gap-4"
    >
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-2xl" aria-hidden>
          📬
        </span>
        <div className="sm:hidden">
          <p className="text-sm font-semibold text-orange-200">
            Never miss a new challenge
          </p>
        </div>
      </div>

      {view === "form" && (
        <form onSubmit={submit} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="hidden flex-1 sm:block">
            <p className="text-sm font-semibold text-orange-200">
              Get an email when a new challenge drops
            </p>
            <p className="text-[11px] text-zinc-400">
              We&apos;ll email you the moment a new reward goes live — no spam, unsubscribe any time.
            </p>
          </div>
          <div className="flex flex-1 gap-2">
            <input
              type="email"
              value={input}
              required
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              placeholder="you@example.com"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-orange-400/60 focus:outline-none sm:max-w-[220px]"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="shrink-0 rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-orange-400 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Notify me"}
            </button>
          </div>
          {error && (
            <p className="text-[11px] text-red-300 sm:basis-full">{error}</p>
          )}
        </form>
      )}

      {view === "pending" && (
        <div className="flex-1 text-sm">
          <p className="font-semibold text-amber-200">
            📨 Confirm your email
          </p>
          <p className="text-[11px] text-zinc-400">
            We sent a link to <span className="font-mono text-zinc-200">{pendingEmail}</span>.{" "}
            <Link href="/notifications" className="text-orange-300 underline-offset-2 hover:underline">
              Manage
            </Link>
          </p>
        </div>
      )}

      {view === "submitted" && (
        <div className="flex-1 text-sm">
          <p className="font-semibold text-emerald-200">
            ✓ Check your inbox at {pendingEmail}
          </p>
          <p className="text-[11px] text-zinc-400">
            Click the link in the email to start receiving challenge alerts.
          </p>
        </div>
      )}

      <div className="flex items-center gap-1 sm:shrink-0">
        <Link
          href="/notifications"
          className="hidden rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-zinc-300 transition hover:border-white/20 hover:text-zinc-100 sm:inline-block"
        >
          More options
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss email prompt"
          className="rounded-full p-1 text-zinc-500 transition hover:bg-white/10 hover:text-zinc-200"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default EmailPromptBanner;
