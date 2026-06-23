"use client";

/**
 * app/forge/page.tsx
 * ---------------------------------------------------------------------------
 * Public Forge hub — lists every enabled crafting recipe. Each card links to
 * the recipe's craft page.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

interface InputGroup {
  label: string | null;
  setId: number | null;
  playId: number | null;
  series: number | null;
  tier: string | null;
  count: number;
}

interface Recipe {
  id: string;
  title: string;
  subtitle: string | null;
  inputs: InputGroup[];
  inputImageUrl: string | null;
  rewardTitle: string;
  rewardImageUrl: string | null;
  accentColor: string | null;
  craftPoints: number;
  totalCrafted: number;
  maxTotal: number | null;
  open: boolean;
  ended: boolean;
  soldOut: boolean;
}

function groupLabel(g: InputGroup): string {
  if (g.label) return `${g.count}× ${g.label}`;
  const parts: string[] = [];
  if (g.setId != null) parts.push(`set ${g.setId}`);
  if (g.playId != null) parts.push(`play ${g.playId}`);
  if (g.tier) parts.push(g.tier);
  if (g.series != null) parts.push(`series ${g.series}`);
  return `${g.count}× ${parts.join(" · ") || "moment"}`;
}

interface MeStats {
  signedIn: boolean;
  craftsCompleted: number;
  craftPoints: number;
}

export default function ForgePage() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [me, setMe] = useState<MeStats | null>(null);

  useEffect(() => {
    void fetch("/api/forge", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ recipes: Recipe[] }>) : { recipes: [] }))
      .then((d) => setRecipes(d.recipes));
    void fetch("/api/forge/me", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<MeStats>) : null))
      .then((d) => setMe(d));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <SiteHeader />

      <div className="relative overflow-hidden border-b border-white/5 bg-gradient-to-br from-orange-600/20 via-red-500/10 to-amber-500/15">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 100%, black 0%, transparent 80%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-orange-300/90">
            Burn to craft · Permanent
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
            THE&nbsp;FORGE
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-zinc-400">
            Burn the required moments to craft something new. Once you forge, the burned moments are
            gone forever — and a fresh moment gets airdropped to your wallet.
          </p>

          {me?.signedIn && (
            <div className="mt-6 grid max-w-md grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                  Crafts completed
                </p>
                <p className="mt-1 text-2xl font-black text-zinc-100">
                  {me.craftsCompleted.toLocaleString()}
                </p>
              </div>
              <div className="rounded-2xl border border-orange-400/20 bg-orange-500/[0.06] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-300/90">
                  Master Collector Crafting Points
                </p>
                <p className="mt-1 text-2xl font-black text-orange-300">
                  {me.craftPoints.toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {recipes === null ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-72 animate-pulse rounded-2xl bg-white/[0.04]" />)}
          </div>
        ) : recipes.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/40 p-16 text-center">
            <p className="text-6xl">🔨</p>
            <h2 className="mt-4 text-2xl font-bold">The forge is cold</h2>
            <p className="mt-2 text-sm text-zinc-500">No crafting recipes right now. Check back soon.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {recipes.map((r) => {
              const accent = r.accentColor ?? "#f97316";
              return (
                <Link key={r.id} href={`/forge/${encodeURIComponent(r.id)}`}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/60 transition hover:border-white/20"
                  style={{ backgroundImage: `radial-gradient(600px 160px at 50% -80px, ${accent}22 0%, transparent 70%)` }}>
                  <div className="relative aspect-video w-full overflow-hidden bg-black/40">
                    {r.rewardImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.rewardImageUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-5xl">🎁</div>
                    )}
                    <span
                      className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                      style={{ background: `${accent}26`, color: accent }}>
                      {r.soldOut ? "Sold out" : r.ended ? "Closed" : r.open ? "Open" : "Soon"}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="font-bold text-zinc-100">{r.title}</h3>
                    {r.subtitle && <p className="mt-0.5 text-xs text-zinc-400">{r.subtitle}</p>}
                    <div className="mt-3 space-y-1 text-[11px] text-zinc-400">
                      <p className="font-semibold uppercase tracking-wider text-zinc-500">Burn</p>
                      {r.inputs.map((g, i) => <p key={i}>· {groupLabel(g)}</p>)}
                    </div>
                    <p className="mt-3 text-sm">
                      <span className="text-zinc-500">Get </span>
                      <span className="font-semibold" style={{ color: accent }}>{r.rewardTitle}</span>
                    </p>
                    <div className="mt-auto flex items-center justify-between pt-3 text-[11px] text-zinc-500">
                      <span>{r.totalCrafted} crafted{r.maxTotal != null ? ` / ${r.maxTotal}` : ""}</span>
                      {r.craftPoints > 0 && (
                        <span className="rounded-full bg-orange-500/10 px-2 py-0.5 font-semibold text-orange-300">
                          +{r.craftPoints} pts
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
