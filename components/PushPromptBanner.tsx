"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "push-prompt-dismissed";

export function PushPromptBanner({ address }: { address: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    setVisible(true);
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="banner"
      className="flex items-center justify-between gap-4 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden>🔔</span>
        <div>
          <p className="text-sm font-semibold text-amber-200">
            Get notified when you complete challenges!
          </p>
          <p className="text-xs text-zinc-400">
            Enable push notifications to stay on top of rewards.{" "}
            <Link
              href={`/profile/${address}`}
              className="underline underline-offset-2 hover:text-zinc-200"
            >
              Go to Profile settings
            </Link>
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss notification prompt"
        className="shrink-0 rounded-full p-1 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export default PushPromptBanner;
