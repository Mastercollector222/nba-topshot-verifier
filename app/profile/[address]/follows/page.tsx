"use client";

/**
 * app/profile/[address]/follows/page.tsx
 * ---------------------------------------------------------------------------
 * Lists followers and following for a given address. Tab is controlled by
 * the ?tab=followers|following query param (defaults to followers).
 * ---------------------------------------------------------------------------
 */

import { use, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";

interface UserRow {
  address: string;
  username: string | null;
  avatarUrl: string | null;
}

type Tab = "followers" | "following";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function FollowsPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const initialTab: Tab = search.get("tab") === "following" ? "following" : "followers";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/follows/list?address=${encodeURIComponent(address)}&type=${tab}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { users: UserRow[] };
        if (!cancelled) setUsers(data.users);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [address, tab]);

  const setTabAndUrl = (next: Tab) => {
    setTab(next);
    const params = new URLSearchParams(search.toString());
    params.set("tab", next);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const heading = useMemo(
    () => (tab === "followers" ? "Followers" : "Following"),
    [tab],
  );

  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader subtitle="Profile" />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={`/profile/${address}`}
            className="text-zinc-400 transition hover:text-zinc-200"
          >
            ← Back to profile
          </Link>
          <span className="text-zinc-600">/</span>
          <span className="font-mono text-xs text-zinc-500">{short(address)}</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
          {heading}
        </h1>

        <div role="tablist" className="flex gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 text-sm">
          {(["followers", "following"] as const).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setTabAndUrl(t)}
                className={
                  "flex-1 rounded-full px-4 py-1.5 capitalize transition " +
                  (active
                    ? "bg-white/10 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200")
                }
              >
                {t}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="motion-safe:animate-pulse h-10 w-10 shrink-0 rounded-full bg-white/5" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="motion-safe:animate-pulse h-4 w-32 rounded bg-white/5" />
                  <div className="motion-safe:animate-pulse h-3 w-24 rounded bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300">
            {error}
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] py-16 text-center text-sm text-zinc-500">
            No {tab} yet.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {users.map((u) => (
              <li key={u.address}>
                <Link
                  href={`/profile/${u.address}`}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-white/20 hover:bg-white/[0.05]"
                >
                  {u.avatarUrl ? (
                    <Image
                      src={u.avatarUrl}
                      alt=""
                      width={40}
                      height={40}
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-400 text-sm font-semibold text-black">
                      {(u.username ?? u.address).slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-zinc-100">
                      {u.username ?? short(u.address)}
                    </span>
                    {u.username && (
                      <span className="truncate font-mono text-[11px] text-zinc-500">
                        {short(u.address)}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
