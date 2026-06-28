"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import * as fcl from "@onflow/fcl";
import { X, Gamepad2, LayoutGrid, ChevronRight, LogOut } from "lucide-react";
import { usePoll } from "@/lib/usePoll";
import { PLAY_LINKS, MORE_LINKS, COMM_LINKS, User as UserIcon } from "@/lib/nav";

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

  // Visibility-aware poll at 120s (doubled from 60s).
  usePoll(fetch_, { intervalMs: 120_000 });

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

  // Visibility-aware poll at 90s (tripled from 30s).
  usePoll(fetch_, { intervalMs: 90_000 });

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

/**
 * Shared bottom-sheet shell used by the Play and More menus. Slides up from
 * the bottom, dims the page, and closes on backdrop tap / Escape / the X.
 * Mobile only (`sm:hidden`).
 */
function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

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
        role="dialog"
        aria-label={title}
        aria-modal="true"
        className={
          "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl border-t border-white/10 bg-[oklch(0.10_0.010_265)] shadow-2xl transition-transform duration-300 ease-out sm:hidden " +
          (open ? "translate-y-0" : "translate-y-full")
        }
        style={{ maxHeight: "85dvh", paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-white/20" />
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            {title}
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-zinc-500 transition hover:text-zinc-300"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}

/** "Play" sheet — a tappable grid of the five game/crafting sections. */
function PlaySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Play">
      <div className="grid grid-cols-2 gap-3 p-4">
        {PLAY_LINKS.map((l) => {
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              onClick={onClose}
              className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition active:bg-white/[0.07]"
            >
              <span
                className={
                  "flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 " +
                  l.accent
                }
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-sm font-semibold text-zinc-100">{l.label}</span>
              <span className="text-[11px] leading-snug text-zinc-500">
                {l.description}
              </span>
            </Link>
          );
        })}
      </div>
    </BottomSheet>
  );
}

function MoreRow({
  icon,
  accent,
  label,
  description,
  badge,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  description: string;
  badge?: number | null;
}) {
  return (
    <span className="flex w-full items-center gap-3 px-5 py-3.5 transition active:bg-white/[0.06]">
      <span
        className={
          "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 " +
          accent
        }
      >
        {icon}
        {(badge ?? 0) > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {(badge ?? 0) > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-medium text-zinc-100">{label}</span>
        <span className="block truncate text-[11px] text-zinc-500">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden />
    </span>
  );
}

/**
 * "More" sheet — exposes every secondary destination so nothing is unreachable
 * on mobile: Progress (Milestones, Rewards, Stack DNA), Inbox (Messages,
 * Notifications) and Account (Profile, Sign out).
 */
function MoreSheet({
  open,
  onClose,
  unreadMessages,
  unreadNotifs,
  onOpenNotifications,
}: {
  open: boolean;
  onClose: () => void;
  unreadMessages: number | null;
  unreadNotifs: number | null;
  onOpenNotifications: () => void;
}) {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/session", { cache: "no-store" });
        const json = (await res.json()) as { address: string | null };
        if (!cancelled) setAddress(json.address ?? null);
      } catch {
        /* tolerated */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const signOut = useCallback(() => {
    onClose();
    try {
      fcl.unauthenticate();
    } catch {
      /* tolerated */
    }
  }, [onClose]);

  const commBadge = (kind: "messages" | "notifications") =>
    kind === "messages" ? unreadMessages : unreadNotifs;

  return (
    <BottomSheet open={open} onClose={onClose} title="More">
      <Section label="Progress" />
      {MORE_LINKS.map((l) => {
        const Icon = l.icon;
        return (
          <Link key={l.href} href={l.href} onClick={onClose} className="block">
            <MoreRow
              icon={<Icon className="h-4 w-4" aria-hidden />}
              accent={l.accent}
              label={l.label}
              description={l.description}
            />
          </Link>
        );
      })}

      <Section label="Inbox" />
      {COMM_LINKS.map((l) => {
        const Icon = l.icon;
        const row = (
          <MoreRow
            icon={<Icon className="h-4 w-4" aria-hidden />}
            accent={l.accent}
            label={l.label}
            description={l.description}
            badge={commBadge(l.kind)}
          />
        );
        if (l.kind === "notifications") {
          return (
            <button
              key={l.href}
              type="button"
              onClick={() => {
                onClose();
                onOpenNotifications();
              }}
              className="block w-full"
            >
              {row}
            </button>
          );
        }
        return (
          <Link key={l.href} href={l.href} onClick={onClose} className="block">
            {row}
          </Link>
        );
      })}

      <Section label="Account" />
      <Link
        href={address ? `/profile/${encodeURIComponent(address)}` : "/profile"}
        onClick={onClose}
        className="block"
      >
        <MoreRow
          icon={<UserIcon className="h-4 w-4" aria-hidden />}
          accent="text-zinc-300"
          label="My Profile"
          description="View and edit your collector profile"
        />
      </Link>
      <button type="button" onClick={signOut} className="block w-full">
        <span className="flex w-full items-center gap-3 px-5 py-3.5 transition active:bg-red-400/10">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 text-red-300">
            <LogOut className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-left text-sm font-medium text-red-300">Sign out</span>
        </span>
      </button>
    </BottomSheet>
  );
}

function Section({ label }: { label: string }) {
  return (
    <div className="px-5 pb-1 pt-4">
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
        {label}
      </span>
    </div>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const [notifOpen, setNotifOpen] = useState(false);
  const [playOpen, setPlayOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const unreadNotifs = useUnreadNotifications();
  const unreadMessages = useUnreadMessages();

  // Close any open sheet on route change so navigation feels snappy.
  useEffect(() => {
    setPlayOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  const moreBadge = (unreadNotifs ?? 0) + (unreadMessages ?? 0);
  const playPaths = PLAY_LINKS.map((l) => l.href);

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
      label: "Play",
      action: () => setPlayOpen(true),
      matchPaths: playPaths,
      icon: <Gamepad2 className="h-6 w-6" aria-hidden />,
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
      label: "More",
      badge: moreBadge,
      action: () => setMoreOpen(true),
      icon: <LayoutGrid className="h-6 w-6" aria-hidden />,
    },
  ];

  return (
    <>
      <NotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
      <PlaySheet open={playOpen} onClose={() => setPlayOpen(false)} />
      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        unreadMessages={unreadMessages}
        unreadNotifs={unreadNotifs}
        onOpenNotifications={() => setNotifOpen(true)}
      />

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
