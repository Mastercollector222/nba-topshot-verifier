"use client";

/**
 * components/MessagesIcon.tsx
 * ---------------------------------------------------------------------------
 * Chat icon with red dot badge for unread messages.
 * Uses usePoll for visibility-aware polling at 90s (tripled from 30s);
 * pauses when the tab is hidden and catches up on focus.
 * The trade-off: a sender's message may take up to 90s to flag the dot
 * if the recipient is actively watching — acceptable for an unread badge.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePoll } from "@/lib/usePoll";

interface ThreadDto {
  unreadCount: number;
}

interface ApiResponse {
  threads: ThreadDto[];
}

export function MessagesIcon() {
  const [unreadTotal, setUnreadTotal] = useState<number | null>(null);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/messages/threads", { cache: "no-store" });
      if (res.status === 401) {
        setUnreadTotal(null);
        return;
      }
      if (!res.ok) {
        return;
      }
      const json = (await res.json()) as ApiResponse;
      const total = (json.threads ?? []).reduce((sum, t) => sum + (t.unreadCount ?? 0), 0);
      setUnreadTotal(total);
    } catch {
      // Network error — keep stale state.
    }
  }, []);

  usePoll(fetchUnread, { intervalMs: 90_000 });

  // Not signed in — render nothing
  if (unreadTotal === null) return null;

  return (
    <Link
      href="/messages"
      aria-label={`Messages${unreadTotal > 0 ? ` (${unreadTotal} unread)` : ""}`}
      className="relative flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {unreadTotal > 0 && (
        <span className="absolute right-1 top-1 flex h-2 w-2 items-center justify-center rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
      )}
    </Link>
  );
}

export default MessagesIcon;
