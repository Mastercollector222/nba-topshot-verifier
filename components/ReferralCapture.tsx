"use client";

/**
 * components/ReferralCapture.tsx
 * ---------------------------------------------------------------------------
 * Mounted once in the root layout. On first render, looks for a `?ref=CODE`
 * query param; if present, POSTs it to /api/referral/capture (which sets an
 * HttpOnly cookie) and then strips the param from the URL. Renders nothing.
 *
 * The /r/[code] short-link route also funnels through here by redirecting
 * to /?ref=CODE.
 * ---------------------------------------------------------------------------
 */

import { useEffect } from "react";

export function ReferralCapture() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const raw = url.searchParams.get("ref");
    if (!raw) return;
    const code = raw.trim().toUpperCase();
    if (!/^[A-F0-9]{8}$/.test(code)) {
      // Strip invalid param so it doesn't linger in shared screenshots.
      url.searchParams.delete("ref");
      window.history.replaceState({}, "", url.toString());
      return;
    }
    void fetch("/api/referral/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .catch(() => {
        /* tolerated — cookie still missing, but the visitor can use the
         * link again later. */
      })
      .finally(() => {
        url.searchParams.delete("ref");
        window.history.replaceState({}, "", url.toString());
      });
  }, []);

  return null;
}

export default ReferralCapture;
