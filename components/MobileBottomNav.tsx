"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface NotificationApiResponse {
  items: unknown[];
  unreadCount: number;
}

interface ThreadDto {
  unreadCount: number;
}

interface ThreadsApiResponse {
  threads: ThreadDto[];
}

function useUnreadNotifications() {
  const [count, setCount] = useState<number | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/me/notifications", { cache: "no-store" });
      if (res.status === 401) { setCount(null); return; }
      const json = (await res.json()) as NotificationApiResponse;
      setCount(json.unreadCount);
    } catch { /* keep stale */ }
  }, []);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, 60_000);
    return () => clearInterval(id);
  }, [fetch_]);

  return count;
}

function useUnreadMessages() {
  const [count, setCount] = useState<number | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/messages/threads", { cache: "no-store" });
      if (res.status === 401) { setCount(null); return; }
      if (!res.ok) return;
      const json = (await res.json()) as ThreadsApiResponse;
      const total = (json.threads ?? []).reduce((s, t) => s + (t.unreadCount ?? 0), 0);
      setCount(total);
    } catch { /* keep stale */ }
  }, []);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, 30_000);
    return () => clearInterval(id);
  }, [fetch_]);

  return count;
}

interface NotificationsDrawerProps {
  open: boolean;
  onClose: () => void;
}

interface NotificationItem {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
  readAt: string | null;
}

function kindIcon(kind: string): string {
  switch (kind) {
    case "badge":     return "🏅";
    case "challenge": return "🏆";
    case "rank":      return "📈";
    case "admin":     return "📣";
    case "follow":    return "👤";
    case "message":   return "💬";
    default:          return "🔔";
  }
}

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

function NotificationsDrawer({ open, onClose }: NotificationsDrawerProps) {
  const router = useRouter();
  const [data, setData] = useState<{ items: NotificationItem[]; unreadCount: number } | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/me/notifications", { cache: "no-store" });
      if (res.status === 401) return;
      const json = (await res.json()) as { items: NotificationItem[]; unreadCount: number };
      setData(json);
    } catch { /* keep stale */ }
  }, []);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function markRead(ids?: number[]) {
    await fetch("/api/me/notifications/mark-read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ids ? { ids } : {}),
    });
    await fetchData();
  }

  async function handleItemClick(item: NotificationItem) {
    onClose();
    if (!item.readAt) await markRead([item.id]);
    if (item.href) router.push(item.href);
  }

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 sm:hidden " +
          (open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")
        }
      />
      <div
        ref={drawerRef}
        role="dialog"
        aria-label="Notifications"
        aria-modal="true"
        className={
          "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl border-t border-white/10 bg-[oklch(0.10_0.010_265)] shadow-2xl transition-transform duration-300 ease-out sm:hidden " +
          (open ? "translate-y-0" : "translate-y-full")
        }
        style={{ maxHeight: "80dvh", paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-white/20" />

        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Notifications
          </span>
          {(data?.unreadCount ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => void markRead()}
              className="text-[10px] text-orange-400 transition hover:text-orange-300"
            >
              Mark all read
            </button>
          )}
        </div>

        <ul className="overflow-y-auto flex-1">
          {!data || data.items.length === 0 ? (
            <li className="px-5 py-10 text-center text-sm text-zinc-500">
              No notifications yet.
            </li>
          ) : (
            data.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void handleItemClick(item)}
                  className={
                    "flex w-full items-start gap-3 px-5 py-4 text-left transition active:bg-white/[0.06] " +
                    (item.readAt ? "opacity-60" : "")
                  }
                >
                  <span className="mt-0.5 shrink-0 text-xl leading-none">{kindIcon(item.kind)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={
                        "truncate text-sm " +
                        (item.readAt ? "text-zinc-400" : "font-semibold text-zinc-100")
                      }>
                        {item.title}
                      </p>
                      <span className="shrink-0 text-[10px] text-zinc-600">{relativeTime(item.createdAt)}</span>
                    </div>
                    {item.body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{item.body}</p>
                    )}
                  </div>
                  {!item.readAt && (
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-orange-400" />
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </>
  );
}

interface NavItem {
  href?: string;
  label: string;
  icon: React.ReactNode;
  badge?: number | null;
  action?: () => void;
  matchPaths?: string[];
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const [notifOpen, setNotifOpen] = useState(false);
  const unreadNotifs = useUnreadNotifications();
  const unreadMessages = useUnreadMessages();

  const isActive = (item: NavItem) => {
    if (item.matchPaths) return item.matchPaths.some((p) => pathname.startsWith(p));
    if (item.href) return pathname === item.href || pathname.startsWith(item.href + "/");
    return false;
  };

  const navItems: NavItem[] = [
    {
      href: "/dashboard",
      label: "Home",
      matchPaths: ["/dashboard", "/"],
      icon: (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      href: "/leaderboard",
      label: "Ranks",
      icon: (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    {
      href: "/rewards",
      label: "Rewards",
      icon: (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      ),
    },
    {
      href: "/messages",
      label: "Messages",
      badge: unreadMessages,
      icon: (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      label: "Alerts",
      badge: unreadNotifs,
      action: () => setNotifOpen(true),
      icon: (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      ),
    },
  ];

  return (
    <>
      <NotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />

      <nav
        aria-label="Main navigation"
        className="fixed bottom-0 inset-x-0 z-30 border-t border-white/8 bg-[oklch(0.08_0.008_265/0.92)] backdrop-blur-md sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex items-stretch">
          {navItems.map((item, idx) => {
            const active = isActive(item);
            const hasBadge = (item.badge ?? 0) > 0;
            const isCenter = idx === 2;
            const inner = (
              <>
                <span className="relative">
                  {isCenter ? (
                    <span
                      className={
                        "flex h-11 w-11 items-center justify-center rounded-full shadow-[0_4px_18px_-4px_rgba(251,113,38,0.65)] transition " +
                        (active
                          ? "bg-gradient-to-br from-orange-400 to-amber-500 text-black"
                          : "bg-gradient-to-br from-orange-500/90 to-amber-500/90 text-black/90")
                      }
                    >
                      {item.icon}
                    </span>
                  ) : (
                    <span className={active ? "text-orange-400" : "text-zinc-400"}>
                      {item.icon}
                    </span>
                  )}
                  {hasBadge && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-[0_0_6px_rgba(239,68,68,0.7)]">
                      {(item.badge ?? 0) > 9 ? "9+" : item.badge}
                    </span>
                  )}
                </span>
                <span className={
                  "mt-1 text-[10px] font-medium tracking-wide " +
                  (isCenter
                    ? (active ? "text-amber-300" : "text-zinc-300")
                    : (active ? "text-orange-400" : "text-zinc-500"))
                }>
                  {item.label}
                </span>
              </>
            );

            const sharedClass =
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 min-h-[56px] transition-colors";

            if (item.action) {
              return (
                <li key={item.label} className="flex flex-1">
                  <button
                    type="button"
                    onClick={item.action}
                    aria-label={
                      hasBadge ? `${item.label} (${item.badge} unread)` : item.label
                    }
                    className={sharedClass}
                  >
                    {inner}
                  </button>
                </li>
              );
            }

            return (
              <li key={item.href} className="flex flex-1">
                <Link
                  href={item.href!}
                  aria-label={
                    hasBadge ? `${item.label} (${item.badge} unread)` : item.label
                  }
                  aria-current={active ? "page" : undefined}
                  className={sharedClass}
                >
                  {inner}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

export default MobileBottomNav;
