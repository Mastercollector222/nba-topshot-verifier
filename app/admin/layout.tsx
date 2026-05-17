"use client";

/**
 * app/admin/layout.tsx
 * ---------------------------------------------------------------------------
 * Shared shell for all /admin/* pages.
 * - Checks /api/admin/me; renders "access denied" if not admin.
 * - Provides a left-rail nav (240 px desktop, collapsible drawer on mobile).
 * - SiteHeader sits at the very top, above the 2-column flex layout.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { label: "Overview",       href: "/admin",               icon: "🏠" },
  { label: "Rules",          href: "/admin/rules",          icon: "📋" },
  { label: "Claims",         href: "/admin/claims",         icon: "🎁" },
  { label: "Fulfillment",    href: "/admin/fulfillment",    icon: "📦" },
  { label: "Treasure Hunts", href: "/admin/treasure-hunts", icon: "🗺️" },
  { label: "Badges",         href: "/admin/badges",         icon: "🏅" },
  { label: "Announcements",  href: "/admin/announcements",  icon: "📣" },
  { label: "TSR",            href: "/admin/tsr",            icon: "📊" },
] as const;

// ---------------------------------------------------------------------------
// Rail link
// ---------------------------------------------------------------------------

function RailLink({
  item,
  active,
  onClick,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
        (active
          ? "bg-orange-500/15 text-orange-300"
          : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100")
      }
    >
      <span className="text-base leading-none">{item.icon}</span>
      {item.label}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Sidebar content (shared between desktop rail and mobile drawer)
// ---------------------------------------------------------------------------

function SidebarContent({
  pathname,
  onNav,
}: {
  pathname: string;
  onNav?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-0.5 p-3">
      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
        Admin
      </p>
      {NAV_ITEMS.map((item) => {
        // /admin matches exactly; sub-routes match by prefix
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <RailLink key={item.href} item={item} active={active} onClick={onNav} />
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

interface MeResponse {
  address: string | null;
  isAdmin: boolean;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/admin/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: MeResponse) => setMe(d));
  }, []);

  // Close drawer on outside click
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setDrawerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [drawerOpen]);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  const isLoading = me === null;
  const isAdmin = me?.isAdmin ?? false;

  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader showAdminLink={false} />

      {isLoading ? (
        /* skeleton */
        <div className="flex flex-1 items-center justify-center">
          <div className="h-6 w-32 animate-pulse rounded-md bg-white/5" />
        </div>
      ) : !isAdmin ? (
        <main className="mx-auto mt-12 w-full max-w-lg px-4">
          <Card>
            <CardHeader>
              <CardTitle>Admin access required</CardTitle>
              <CardDescription>
                {me?.address
                  ? <>Address <span className="font-mono">{me.address}</span> is not in <span className="font-mono">ADMIN_FLOW_ADDRESSES</span>.</>
                  : "Sign in from the dashboard first, then add your address to the env allowlist."}
              </CardDescription>
            </CardHeader>
          </Card>
        </main>
      ) : (
        <div className="flex flex-1">
          {/* ----------------------------------------------------------------
              Mobile drawer backdrop
          ---------------------------------------------------------------- */}
          {drawerOpen && (
            <div
              className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
              aria-hidden="true"
            />
          )}

          {/* ----------------------------------------------------------------
              Mobile drawer
          ---------------------------------------------------------------- */}
          <div
            ref={drawerRef}
            className={
              "fixed inset-y-0 left-0 z-40 w-64 transform border-r border-white/5 bg-[oklch(0.10_0.008_265)] transition-transform duration-200 md:hidden " +
              (drawerOpen ? "translate-x-0" : "-translate-x-full")
            }
          >
            <div className="flex h-14 items-center border-b border-white/5 px-4">
              <span className="text-sm font-semibold text-zinc-200">Admin Panel</span>
            </div>
            <SidebarContent pathname={pathname ?? ""} onNav={() => setDrawerOpen(false)} />
          </div>

          {/* ----------------------------------------------------------------
              Desktop left rail
          ---------------------------------------------------------------- */}
          <aside className="hidden w-[240px] shrink-0 border-r border-white/5 md:block">
            <SidebarContent pathname={pathname ?? ""} />
          </aside>

          {/* ----------------------------------------------------------------
              Main content
          ---------------------------------------------------------------- */}
          <main className="flex min-w-0 flex-1 flex-col">
            {/* Mobile top bar with hamburger */}
            <div className="flex h-11 items-center border-b border-white/5 px-4 md:hidden">
              <button
                type="button"
                onClick={() => setDrawerOpen((o) => !o)}
                className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-100"
                aria-label="Open admin menu"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
                </svg>
                Admin menu
              </button>
            </div>

            <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
              {children}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
