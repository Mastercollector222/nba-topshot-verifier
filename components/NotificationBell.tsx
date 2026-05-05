"use client";

/**
 * components/NotificationBell.tsx
 * ---------------------------------------------------------------------------
 * 🔔 Notification bell for SiteHeader.
 *
 * - Polls GET /api/me/notifications every 60 s.
 * - Shows a red dot when unreadCount > 0.
 * - Click opens a glass dropdown with up to 10 items, relative time,
 *   icon by kind.
 * - Clicking an item navigates to href and marks it read.
 * - "Mark all read" button at the bottom.
 * - Hidden when the user is not signed in (unreadCount stays null).
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface NotificationItem {
  id: number;
  kind: "badge" | "challenge" | "rank" | "admin";
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
  readAt: string | null;
}

interface ApiResponse {
  items: NotificationItem[];
  unreadCount: number;
}

// ---------------------------------------------------------------------------
// Kind icons (emoji — no extra dep)
// ---------------------------------------------------------------------------
function kindIcon(kind: string): string {
  switch (kind) {
    case "badge":     return "🏅";
    case "challenge": return "🏆";
    case "rank":      return "📈";
    case "admin":     return "📣";
    default:          return "🔔";
  }
}

// ---------------------------------------------------------------------------
// Relative time
// ---------------------------------------------------------------------------
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return "just now";
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function NotificationBell() {
  const router = useRouter();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/me/notifications", { cache: "no-store" });
      if (res.status === 401) { setData(null); return; }
      const json = (await res.json()) as ApiResponse;
      setData(json);
    } catch {
      // Network error — keep stale state.
    }
  }, []);

  // Initial fetch + 60 s poll.
  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Not signed in — render nothing.
  if (data === null) return null;

  const unread = data.unreadCount;
  const items  = data.items;

  async function markRead(ids?: number[]) {
    await fetch("/api/me/notifications/mark-read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ids ? { ids } : {}),
    });
    await fetchNotifications();
  }

  async function handleItemClick(item: NotificationItem) {
    setOpen(false);
    if (!item.readAt) await markRead([item.id]);
    if (item.href) router.push(item.href);
  }

  return (
    <div className="relative" ref={dropRef}>
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-2 w-2 items-center justify-center rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 overflow-hidden rounded-2xl border border-white/10 bg-[oklch(0.11_0.012_265)] shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
              Notifications
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markRead()}
                className="text-[10px] text-orange-400 transition hover:text-orange-300"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Items */}
          <ul className="max-h-[360px] overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-zinc-500">
                No notifications yet.
              </li>
            ) : (
              items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void handleItemClick(item)}
                    className={
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04] " +
                      (item.readAt ? "opacity-60" : "")
                    }
                  >
                    {/* Unread dot */}
                    <span className="mt-0.5 shrink-0 text-lg leading-none">
                      {kindIcon(item.kind)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={
                          "truncate text-[12px] " +
                          (item.readAt ? "text-zinc-400" : "font-semibold text-zinc-100")
                        }>
                          {item.title}
                        </p>
                        <span className="shrink-0 text-[10px] text-zinc-600">
                          {relativeTime(item.createdAt)}
                        </span>
                      </div>
                      {item.body && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">
                          {item.body}
                        </p>
                      )}
                    </div>
                    {!item.readAt && (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>

          {/* Footer */}
          {items.length > 0 && unread === 0 && (
            <div className="border-t border-white/5 px-4 py-2.5 text-center text-[10px] text-zinc-600">
              All caught up ✓
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
