"use client";

/**
 * components/UserSearch.tsx
 * ---------------------------------------------------------------------------
 * Debounced user search with avatar dropdown. Designed to sit inside the
 * SiteHeader desktop nav cluster.
 *
 * Behaviour:
 *   - Debounces 200 ms after each keystroke before calling /api/search/users
 *   - Shows a dropdown of up to 8 results (avatar circle + username/address)
 *   - Clicking a result navigates to /profile/<address>, closes + clears
 *   - Escape closes; click outside closes
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

interface UserResult {
  address: string;
  username: string | null;
  avatarUrl: string | null;
}

function shortAddr(addr: string) {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export function UserSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch results with 200 ms debounce.
  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/search/users?q=${encodeURIComponent(q)}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as { results: UserResult[] };
        setResults(data.results ?? []);
        setOpen(true);
        setHighlighted(-1);
      } catch {
        /* tolerated */
      } finally {
        setLoading(false);
      }
    }, 200);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    search(v);
  }

  function navigate(address: string) {
    router.push(`/profile/${address}`);
    setQuery("");
    setResults([]);
    setOpen(false);
    setHighlighted(-1);
  }

  // Keyboard navigation.
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "Escape") {
      setOpen(false);
      setHighlighted(-1);
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      navigate(results[highlighted].address);
    }
  }

  // Close on click outside.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setHighlighted(-1);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* Input */}
      <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs transition focus-within:border-orange-400/40 focus-within:bg-white/[0.07]">
        <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Search collectors…"
          className="w-36 bg-transparent text-zinc-200 placeholder-zinc-500 outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        {loading ? (
          <div className="h-3 w-3 shrink-0 animate-spin rounded-full border border-transparent border-t-zinc-400" />
        ) : null}
      </div>

      {/* Dropdown */}
      {open && results.length > 0 ? (
        <ul className="glass absolute left-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-white/10 py-1 shadow-xl">
          {results.map((r, i) => (
            <li key={r.address}>
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  navigate(r.address);
                }}
                className={
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition " +
                  (i === highlighted
                    ? "bg-white/10 text-zinc-100"
                    : "text-zinc-300 hover:bg-white/5 hover:text-zinc-100")
                }
              >
                {/* Avatar circle */}
                <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full border border-white/10 bg-black/40">
                  {r.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[8px] font-bold uppercase text-zinc-500">
                      {(r.username ?? r.address).slice(0, 2)}
                    </span>
                  )}
                </div>
                <span className="min-w-0 truncate">
                  {r.username ?? shortAddr(r.address)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : open && !loading && query.length >= 2 ? (
        <div className="glass absolute left-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-white/10 px-3 py-3 text-xs text-zinc-500 shadow-xl">
          No collectors found
        </div>
      ) : null}
    </div>
  );
}

export default UserSearch;
