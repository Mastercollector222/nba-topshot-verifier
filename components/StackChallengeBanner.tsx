"use client";

/**
 * components/StackChallengeBanner.tsx
 * ---------------------------------------------------------------------------
 * Discovery banner for Test Your Stack. Self-contained: fetches the public
 * challenge list and renders a CTA hero ONLY if at least one challenge is
 * currently within its active window (and not yet settled). Renders nothing
 * otherwise — safe to drop into any page's header area.
 * ---------------------------------------------------------------------------
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface Challenge {
  id: string;
  title: string;
  subtitle: string | null;
  playerName: string | null;
  setName: string | null;
  thumbnailUrl: string | null;
  startsAt: string;
  endsAt: string;
  prizeTitle: string;
  accentColor: string | null;
  settledAt: string | null;
}

function useCountdown(targetIso: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const target = useMemo(() => Date.parse(targetIso), [targetIso]);
  const remaining = Math.max(0, target - now);
  const totalSec = Math.floor(remaining / 1000);
  return {
    days:  Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    mins:  Math.floor((totalSec % 3600) / 60),
    secs:  totalSec % 60,
    expired: remaining === 0,
  };
}

export function StackChallengeBanner() {
  const [challenge, setChallenge] = useState<Challenge | null | "loading">("loading");

  useEffect(() => {
    let alive = true;
    void fetch("/api/stack-challenges", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ challenges: Challenge[] }>) : { challenges: [] }))
      .then((d) => {
        if (!alive) return;
        const now = Date.now();
        // Pick the soonest-ending active (not-yet-settled, within window) challenge.
        const active = d.challenges
          .filter((c) => !c.settledAt && Date.parse(c.startsAt) <= now && Date.parse(c.endsAt) > now)
          .sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt))[0];
        setChallenge(active ?? null);
      })
      .catch(() => setChallenge(null));
    return () => { alive = false; };
  }, []);

  if (challenge === "loading" || challenge === null) return null;

  const accent = challenge.accentColor ?? "#f97316";
  return <BannerInner challenge={challenge} accent={accent} />;
}

function BannerInner({ challenge, accent }: { challenge: Challenge; accent: string }) {
  const c = useCountdown(challenge.endsAt);

  return (
    <Link
      href={`/test-your-stack#${challenge.id}`}
      className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 transition hover:border-white/20"
      style={{
        backgroundImage: `radial-gradient(800px 200px at 90% -50%, ${accent}40 0%, transparent 70%)`,
      }}
    >
      {/* Animated grid floor */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            `linear-gradient(${accent} 1px, transparent 1px), linear-gradient(90deg, ${accent} 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
          maskImage: "linear-gradient(to right, transparent 0%, black 50%, transparent 100%)",
        }}
      />

      <div className="relative flex flex-wrap items-center gap-4 p-4 sm:gap-6 sm:p-5">
        {/* Moment thumb */}
        {challenge.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={challenge.thumbnailUrl}
            alt=""
            className="h-16 w-16 flex-none rounded-lg object-cover ring-2 ring-white/10 sm:h-20 sm:w-20"
            style={{ boxShadow: `0 0 24px ${accent}66` }}
          />
        ) : (
          <div className="h-16 w-16 flex-none rounded-lg bg-zinc-800 sm:h-20 sm:w-20" />
        )}

        <div className="min-w-0 flex-1">
          <p
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em]"
            style={{ color: accent }}
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: accent }} />
            Test Your Stack · Live now
          </p>
          <h3 className="mt-1 truncate text-lg font-black tracking-tight text-zinc-100 sm:text-xl">
            {challenge.title}
          </h3>
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            🏆 {challenge.prizeTitle}
            {challenge.playerName && (
              <span className="ml-2 text-zinc-600">· {challenge.playerName}</span>
            )}
          </p>
        </div>

        {/* Countdown — compact */}
        <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-black/50 px-3 py-2 sm:flex">
          {c.days > 0 && <CountCell n={c.days} label="d" accent={accent} />}
          <CountCell n={c.hours} label="h" accent={accent} />
          <CountCell n={c.mins}  label="m" accent={accent} />
          <CountCell n={c.secs}  label="s" accent={accent} />
        </div>

        <span
          className="rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider transition group-hover:scale-105"
          style={{ background: accent, color: "#0a0a0a" }}
        >
          Enter →
        </span>
      </div>
    </Link>
  );
}

function CountCell({ n, label, accent }: { n: number; label: string; accent: string }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className="font-mono text-base font-black leading-none tabular-nums"
        style={{ color: accent }}
      >
        {String(n).padStart(2, "0")}
      </span>
      <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-600">{label}</span>
    </div>
  );
}
