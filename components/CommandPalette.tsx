"use client";

/**
 * components/CommandPalette.tsx
 * ---------------------------------------------------------------------------
 * Global command palette (⌘K / Ctrl+K).
 *
 * Groups:
 *   Pages   — static nav links (Dashboard, Leaderboard, Profile, Treasure Hunt)
 *   Users   — debounced /api/search/users?q= results (200 ms)
 *   Moments — debounced /api/search/moments?q= results (200 ms, auth only)
 *
 * Keyboard:
 *   ⌘K / Ctrl+K  open
 *   Escape        close
 *   ArrowUp/Down  move selection
 *   Enter         activate selection
 * ---------------------------------------------------------------------------
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  Navigation,
  User,
  Image as ImageIcon,
  Search,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PageResult {
  kind: "page";
  id: string;
  label: string;
  href: string;
}

interface UserResult {
  kind: "user";
  id: string;
  label: string;
  sub: string;
  address: string;
  avatarUrl: string | null;
}

interface MomentResult {
  kind: "moment";
  id: string;
  label: string;
  sub: string;
  momentId: string;
  tier: string | null;
}

type Result = PageResult | UserResult | MomentResult;

// ---------------------------------------------------------------------------
// Static page options
// ---------------------------------------------------------------------------

const PAGES: PageResult[] = [
  { kind: "page", id: "p-dashboard",    label: "Dashboard",    href: "/dashboard" },
  { kind: "page", id: "p-leaderboard",  label: "Leaderboard",  href: "/leaderboard" },
  { kind: "page", id: "p-profile",      label: "Profile",      href: "/profile" },
  { kind: "page", id: "p-treasure",     label: "Treasure Hunt", href: "/treasure-hunt" },
  { kind: "page", id: "p-admin",        label: "Admin",        href: "/admin" },
];

// ---------------------------------------------------------------------------
// Fuzzy filter helper (simple substring, case-insensitive)
// ---------------------------------------------------------------------------

function fuzzy(target: string, q: string): boolean {
  if (!q) return true;
  const tl = target.toLowerCase();
  const ql = q.toLowerCase();
  let ti = 0;
  for (let qi = 0; qi < ql.length; qi++) {
    const idx = tl.indexOf(ql[qi], ti);
    if (idx === -1) return false;
    ti = idx + 1;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Tier colour chip
// ---------------------------------------------------------------------------

function tierClass(tier: string | null): string {
  switch ((tier ?? "").toUpperCase()) {
    case "ULTIMATE":  return "text-fuchsia-300";
    case "LEGENDARY": return "text-amber-300";
    case "RARE":      return "text-sky-300";
    default:          return "text-zinc-400";
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [momentResults, setMomentResults] = useState<MomentResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const userTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const momentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Open / close via ⌘K / Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setUserResults([]);
      setMomentResults([]);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced user search
  useEffect(() => {
    if (userTimer.current) clearTimeout(userTimer.current);
    if (query.length < 2) { setUserResults([]); return; }
    userTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/users?q=${encodeURIComponent(query)}`, { cache: "no-store" });
        const body = (await res.json()) as {
          results: Array<{ address: string; username: string | null; avatarUrl: string | null }>;
        };
        setUserResults(
          (body.results ?? []).map((r) => ({
            kind: "user",
            id: `u-${r.address}`,
            label: r.username ?? r.address,
            sub: r.username ? r.address : "",
            address: r.address,
            avatarUrl: r.avatarUrl,
          })),
        );
      } catch { setUserResults([]); }
    }, 200);
    return () => { if (userTimer.current) clearTimeout(userTimer.current); };
  }, [query]);

  // Debounced moment search
  useEffect(() => {
    if (momentTimer.current) clearTimeout(momentTimer.current);
    if (query.length < 2) { setMomentResults([]); return; }
    momentTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/moments?q=${encodeURIComponent(query)}`, { cache: "no-store" });
        if (!res.ok) { setMomentResults([]); return; }
        const body = (await res.json()) as {
          results: Array<{ momentId: string; player: string | null; setName: string | null; serial: number; tier: string | null }>;
        };
        setMomentResults(
          (body.results ?? []).map((r) => ({
            kind: "moment",
            id: `m-${r.momentId}`,
            label: r.player ?? `Moment #${r.momentId}`,
            sub: [r.setName, `#${r.serial}`].filter(Boolean).join(" · "),
            momentId: r.momentId,
            tier: r.tier,
          })),
        );
      } catch { setMomentResults([]); }
    }, 200);
    return () => { if (momentTimer.current) clearTimeout(momentTimer.current); };
  }, [query]);

  // Build flat result list
  const filteredPages = PAGES.filter((p) => fuzzy(p.label, query));

  const allResults: Result[] = [
    ...filteredPages,
    ...userResults,
    ...momentResults,
  ];

  // Clamp active index whenever list changes
  useEffect(() => {
    setActiveIdx((i) => Math.min(i, Math.max(0, allResults.length - 1)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allResults.length]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const activate = useCallback(
    (r: Result) => {
      setOpen(false);
      if (r.kind === "page")    router.push(r.href);
      if (r.kind === "user")    router.push(`/profile/${r.address}`);
      if (r.kind === "moment")  router.push(`/dashboard?moment=${r.momentId}`);
    },
    [router],
  );

  // Arrow / Enter navigation inside the input
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, allResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = allResults[activeIdx];
      if (r) activate(r);
    }
  }

  if (!open) return null;

  // Group indices for section labels
  const pageEnd = filteredPages.length;
  const userEnd = pageEnd + userResults.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[9999] flex items-start justify-center px-4 pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="glass-strong relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search pages, collectors, moments…"
            className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <kbd className="shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
            Esc
          </kbd>
        </div>

        {/* Results */}
        {allResults.length === 0 && query.length >= 2 ? (
          <p className="px-5 py-8 text-center text-xs text-zinc-500">No results for &ldquo;{query}&rdquo;</p>
        ) : allResults.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-zinc-600">Type to search…</p>
        ) : (
          <ul ref={listRef} className="max-h-[320px] overflow-y-auto py-2">
            {allResults.map((r, i) => {
              const active = i === activeIdx;
              const showPageLabel  = i === 0 && pageEnd > 0;
              const showUserLabel  = i === pageEnd && userResults.length > 0;
              const showMomentLabel = i === userEnd && momentResults.length > 0;

              return (
                <li key={r.id}>
                  {/* Section heading */}
                  {(showPageLabel || showUserLabel || showMomentLabel) && (
                    <p className="flex items-center gap-1.5 px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                      {showPageLabel  && <><Navigation className="h-3 w-3" /> Pages</>}
                      {showUserLabel  && <><User        className="h-3 w-3" /> Collectors</>}
                      {showMomentLabel && <><ImageIcon  className="h-3 w-3" /> Moments</>}
                    </p>
                  )}

                  <button
                    type="button"
                    className={
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left transition " +
                      (active ? "bg-white/10" : "hover:bg-white/5")
                    }
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => activate(r)}
                  >
                    {/* Icon */}
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/5 text-zinc-400">
                      {r.kind === "page"   && <Navigation className="h-3.5 w-3.5" />}
                      {r.kind === "user"   && (
                        r.avatarUrl
                          ? <img src={r.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                          : <User className="h-3.5 w-3.5" />
                      )}
                      {r.kind === "moment" && <ImageIcon className="h-3.5 w-3.5" />}
                    </span>

                    {/* Label + sub */}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-zinc-100">{r.label}</span>
                      {r.kind !== "page" && r.sub ? (
                        <span className={
                          "block truncate text-[11px] " +
                          (r.kind === "moment" ? tierClass(r.tier) : "text-zinc-500")
                        }>
                          {r.sub}
                        </span>
                      ) : null}
                    </span>

                    {/* Active indicator */}
                    {active && (
                      <kbd className="shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                        ↵
                      </kbd>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-white/5 px-4 py-2.5 text-[10px] text-zinc-600">
          <Command className="h-3 w-3" />
          <span>K to toggle</span>
          <span className="ml-auto flex gap-3">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
