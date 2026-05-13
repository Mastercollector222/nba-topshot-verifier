"use client";

/**
 * components/ReferralsCard.tsx
 * ---------------------------------------------------------------------------
 * "Refer Friends" panel rendered on /rewards. Fetches the signed-in user's
 * referral snapshot from /api/me/referral and shows:
 *   - Their unique code + share link (copy + Share-on-X buttons)
 *   - Count of referrals + total TSR earned
 *   - List of users they've referred (avatar + username)
 *
 * Awards (handled server-side):
 *   - Referrer: +200 TSR per new referee
 *   - Referee:  +50 TSR welcome bonus on first sign-in via the link
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "@/components/Toaster";

interface Referee {
  address: string;
  username: string | null;
  avatarUrl: string | null;
  referredAt: string;
}

interface Stats {
  code: string | null;
  referralCount: number;
  totalEarned: number;
  referees: Referee[];
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ReferralsCard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/referral", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Stats | null) => {
        if (!cancelled) {
          setStats(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="motion-safe:animate-pulse h-48 rounded-2xl bg-white/[0.03]" />;
  }
  if (!stats || !stats.code) return null;

  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/r/${stats.code}`
      : `/r/${stats.code}`;

  const tweet = `I'm earning TSR rewards on Top Shot Verifier — a stats + rewards hub for NBA Top Shot collectors. Sign up with my link and we both get bonus points 🔥`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    tweet,
  )}&url=${encodeURIComponent(link)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      toast("Referral link copied!", "success");
    } catch {
      toast("Could not copy — long-press the link to copy manually.", "error");
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-300">
        Refer friends
      </h2>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-transparent">
        {/* Hero */}
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300">
              Your code
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-zinc-100">
              {stats.code}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Referrals
            </p>
            <p className="mt-1 text-2xl font-bold text-zinc-100">
              {stats.referralCount}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              TSR earned
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-300">
              +{stats.totalEarned.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Link + actions */}
        <div className="border-t border-white/5 bg-black/20 p-5">
          <p className="text-xs text-zinc-400">
            Share this link. When a friend signs up, you get{" "}
            <span className="font-semibold text-amber-300">+200 TSR</span> and
            they get <span className="font-semibold text-amber-300">+50 TSR</span>.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 truncate rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-zinc-200">
              {link}
            </code>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-orange-400"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy
              </button>
              <a
                href={twitterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-transparent px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-sky-400/40 hover:text-sky-300"
              >
                <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden>
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.261 5.636 5.903-5.636Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Share on X
              </a>
            </div>
          </div>
        </div>

        {/* Referee list */}
        {stats.referees.length > 0 && (
          <div className="border-t border-white/5 px-5 py-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              People you&apos;ve referred
            </p>
            <ul className="space-y-2">
              {stats.referees.slice(0, 10).map((r) => (
                <li
                  key={r.address}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.02] px-3 py-2"
                >
                  <Link
                    href={`/profile/${r.address}`}
                    className="flex min-w-0 flex-1 items-center gap-3 transition hover:opacity-80"
                  >
                    <span className="block h-8 w-8 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10">
                      {r.avatarUrl ? (
                        <Image
                          src={r.avatarUrl}
                          alt=""
                          width={32}
                          height={32}
                          className="h-8 w-8 object-cover"
                        />
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center bg-gradient-to-br from-orange-500 to-amber-400 text-[10px] font-bold text-black">
                          {(r.username ?? r.address).slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-100">
                        {r.username ?? shortAddr(r.address)}
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        Joined {fmtDate(r.referredAt)}
                      </p>
                    </span>
                  </Link>
                  <span className="shrink-0 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                    +200
                  </span>
                </li>
              ))}
            </ul>
            {stats.referees.length > 10 && (
              <p className="mt-2 text-center text-[10px] text-zinc-500">
                +{stats.referees.length - 10} more
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default ReferralsCard;
