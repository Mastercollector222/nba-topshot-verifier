"use client";

/**
 * /dna — "Stack DNA" page.
 *
 * Reads the signed-in user's collector personality from /api/me/dna,
 * shows a flashy card, and offers a Refresh button + Share-on-X intent
 * (which awards +10 TSR daily via /api/me/share-profile, reusing the
 * existing daily share key).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/Toaster";

interface Trait {
  label: string;
  value: string;
}

interface Stats {
  totalMoments: number;
  lockedMoments: number;
  lockedPct: number;
  uniqueTeams: number;
  uniquePlayers: number;
  uniqueSets: number;
  topTeam: { name: string; count: number; pct: number } | null;
  topPlayer: { name: string; count: number; pct: number } | null;
  topSet: { name: string; count: number; pct: number } | null;
  avgSerial: number | null;
  lowSerialCount: number;
  vintageCount: number;
  vintagePct: number;
  deepSetCount: number;
}

interface Dna {
  archetype: { slug: string; name: string; emoji: string; accent: string };
  tagline: string;
  stats: Stats;
  traits: Trait[];
  generatedAt: string;
}

export default function StackDnaPage() {
  const [dna, setDna] = useState<Dna | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/dna", { cache: "no-store" });
      if (res.status === 401) {
        setError("Sign in to see your Stack DNA.");
        setDna(null);
        return;
      }
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to load");
      setDna(j.dna as Dna);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/me/dna", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      setDna(j.dna as Dna);
      toast("Stack DNA refreshed", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Refresh failed", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const share = async () => {
    if (!dna) return;
    const text = `${dna.archetype.emoji} I'm ${dna.archetype.name} on @TopShot.\n\n${dna.tagline}\n\nFind your Stack DNA →`;
    const url = "https://topshotcommunityrewards.com/dna";
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(intent, "_blank", "noopener,noreferrer");
    // Award daily TSR via the existing share endpoint.
    try {
      const r = await fetch("/api/me/share-profile", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (typeof j.awarded === "number" && j.awarded > 0) {
        toast(`+${j.awarded} TSR for sharing today`, "success");
      }
    } catch {
      // silent — share intent already opened
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12">
        <div className="h-64 animate-pulse rounded-2xl bg-white/5" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-zinc-100">Stack DNA</h1>
        <p className="mt-3 text-sm text-zinc-400">{error}</p>
      </main>
    );
  }

  if (!dna) return null;

  const accent = dna.archetype.accent || "#f97316";
  const lockedPct = Math.round(dna.stats.lockedPct * 100);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
            Collector Identity
          </p>
          <h1 className="mt-1 text-2xl font-black text-zinc-100 sm:text-3xl">
            Your Stack DNA
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <Button onClick={share} style={{ background: accent }}>
            Share on X
          </Button>
        </div>
      </div>

      {/* Hero card */}
      <div
        className="relative overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-10"
        style={{
          background:
            `radial-gradient(1200px 400px at 0% 0%, ${accent}33, transparent 60%), ` +
            `radial-gradient(900px 300px at 100% 100%, ${accent}22, transparent 60%), ` +
            `linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.4))`,
          boxShadow: `0 0 60px ${accent}22 inset`,
        }}
      >
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p
              className="text-[11px] font-bold uppercase tracking-[0.3em]"
              style={{ color: accent }}
            >
              Archetype
            </p>
            <h2 className="mt-1 flex items-center gap-3 text-3xl font-black text-zinc-100 sm:text-5xl">
              <span aria-hidden>{dna.archetype.emoji}</span>
              <span>{dna.archetype.name}</span>
            </h2>
          </div>
          <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
            v{new Date(dna.generatedAt).toISOString().slice(0, 10)}
          </div>
        </div>

        <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-200 sm:text-lg">
          {dna.tagline}
        </p>

        {/* Big stat strip */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Stack" value={String(dna.stats.totalMoments)} accent={accent} />
          <Stat label="Locked" value={`${lockedPct}%`} accent={accent} />
          <Stat label="Teams" value={String(dna.stats.uniqueTeams)} accent={accent} />
          <Stat label="Sets" value={String(dna.stats.uniqueSets)} accent={accent} />
        </div>
      </div>

      {/* Traits */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
          Traits
        </h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {dna.traits.map((t) => (
            <li
              key={t.label}
              className="flex items-baseline justify-between gap-3 rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/5"
            >
              <span className="text-xs uppercase tracking-wider text-zinc-500">
                {t.label}
              </span>
              <span className="truncate text-sm font-semibold text-zinc-100">
                {t.value}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-center text-[11px] text-zinc-600">
        Generated from your locked + unlocked moments. Refresh up to once per
        day. <Link href="/rewards" className="underline hover:text-zinc-400">
          Earn TSR by sharing →
        </Link>
      </p>
    </main>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3 backdrop-blur">
      <p
        className="text-[10px] font-bold uppercase tracking-widest"
        style={{ color: accent }}
      >
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-black text-zinc-100">
        {value}
      </p>
    </div>
  );
}
