"use client";

/**
 * lib/usePoll.ts
 * ---------------------------------------------------------------------------
 * Visibility-aware polling hook. Replaces the naive
 * `setInterval(fetch, N)` pattern used across the app.
 *
 * Behavior:
 *   - Calls `fn()` immediately on mount.
 *   - Schedules subsequent calls every `intervalMs`.
 *   - When the tab is hidden (document.visibilityState === "hidden"),
 *     SKIPS scheduled calls — no network traffic at all.
 *   - When the tab regains focus, runs ONE catch-up fetch so the user
 *     never sees stale data on return.
 *   - On unmount or `enabled=false`, clears the interval + listener.
 *
 * Why this matters: every poller in the app (notifications, messages,
 * feed, …) was hammering Supabase 24/7 even for tabs that hadn't been
 * looked at in hours. This is the #1 egress saver and is completely
 * invisible to active users — they always get a fresh fetch on focus.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useRef } from "react";

export interface UsePollOptions {
  /** Polling interval in ms. Defaults to 60_000 (1 minute). */
  intervalMs?: number;
  /** Set false to disable polling entirely (e.g. user not signed in). */
  enabled?: boolean;
  /**
   * If false, skips the immediate fetch on mount. Defaults to true.
   * Use this when the parent component has already loaded initial data.
   */
  immediate?: boolean;
}

export function usePoll(fn: () => void | Promise<void>, opts: UsePollOptions = {}) {
  const { intervalMs = 60_000, enabled = true, immediate = true } = opts;

  // Stash the latest fn in a ref so consumers don't need to memoize it.
  // The interval always calls the freshest version without resubscribing.
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;

    let cancelled = false;

    const run = () => {
      if (cancelled) return;
      if (document.visibilityState === "hidden") return;
      void fnRef.current();
    };

    if (immediate) run();

    const id = window.setInterval(run, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, immediate, intervalMs]);
}

export default usePoll;
