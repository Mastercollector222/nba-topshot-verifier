"use client";

/**
 * app/forge/[id]/page.tsx
 * ---------------------------------------------------------------------------
 * Forge craft page. Shows the recipe requirements, which of the viewer's
 * moments qualify (auto-selected burn set), and the craft flow:
 *   1. "Forge" → commits the burn set (pending_burn submission).
 *   2. User burns those moments on Top Shot.
 *   3. "Confirm burn" → live on-chain check; flips to burn_verified.
 *   4. Admin airdrops the reward.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { toast } from "@/components/Toaster";

interface InputGroup {
  label: string | null;
  setId: number | null;
  playId: number | null;
  series: number | null;
  tier: string | null;
  count: number;
}

interface SelectedMoment {
  momentID: string;
  setID: number;
  playID: number;
  serialNumber: number;
  setName: string | null;
  series: number | null;
  thumbnail: string | null;
  playerName: string | null;
  tier: string | null;
}

interface GroupMatch {
  index: number;
  group: InputGroup;
  satisfied: boolean;
  selected: SelectedMoment[];
  candidateCount: number;
}

interface Recipe {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  requireSoldOrigin: boolean;
  inputs: InputGroup[];
  rewardTitle: string;
  rewardDescription: string | null;
  rewardImageUrl: string | null;
  rewardMomentUrl: string | null;
  accentColor: string | null;
  maxPerUser: number;
  maxTotal: number | null;
  totalCrafted: number;
}

interface Submission {
  id: string;
  status: string;
  committedMomentIds: string[];
  adminNote: string | null;
  createdAt: string;
}

interface Detail {
  recipe: Recipe;
  open: boolean;
  ended: boolean;
  soldOut: boolean;
  remainingForUser: number | null;
  remainingTotal: number | null;
  signedIn: boolean;
  match: {
    craftable: boolean;
    selectedMomentIds: string[];
    groups: GroupMatch[];
  } | null;
  submissions: Submission[];
}

function groupLabel(g: InputGroup): string {
  if (g.label) return g.label;
  const parts: string[] = [];
  if (g.setId != null) parts.push(`set ${g.setId}`);
  if (g.playId != null) parts.push(`play ${g.playId}`);
  if (g.tier) parts.push(g.tier);
  if (g.series != null) parts.push(`series ${g.series}`);
  return parts.join(" · ") || "any moment";
}

export default function ForgeCraftPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/forge/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (res.status === 404) { setNotFound(true); return; }
    if (res.ok) setData(await res.json());
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const forge = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/forge/${encodeURIComponent(id)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not forge");
      toast("Burn set committed! Now burn those moments on Top Shot, then confirm.", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not forge", "error");
    } finally {
      setBusy(false);
    }
  };

  const confirmBurn = async (submissionId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/forge/submissions/${submissionId}`, { method: "POST" });
      const j = await res.json();
      if (!res.ok || j.verified === false) {
        throw new Error(j.error ?? "Burn not confirmed");
      }
      toast("Burn confirmed! Your reward will be airdropped soon.", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Burn not confirmed", "error");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (submissionId: string) => {
    if (!confirm("Cancel this pending forge? Your moments stay in your wallet.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/forge/submissions/${submissionId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Cancel failed");
      toast("Cancelled", "info");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Cancel failed", "error");
    } finally {
      setBusy(false);
    }
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <SiteHeader />
        <div className="mx-auto max-w-2xl px-4 py-24 text-center">
          <p className="text-5xl">🔨</p>
          <h1 className="mt-4 text-2xl font-bold">Recipe not found</h1>
          <Link href="/forge" className="mt-4 inline-block text-orange-300 hover:text-orange-200">← Back to the Forge</Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <SiteHeader />
        <div className="mx-auto max-w-4xl px-4 py-12"><div className="h-96 animate-pulse rounded-3xl bg-white/[0.04]" /></div>
      </div>
    );
  }

  const { recipe, match } = data;
  const accent = recipe.accentColor ?? "#f97316";
  const pending = data.submissions.filter((s) => s.status === "pending_burn");
  const history = data.submissions.filter((s) => s.status !== "pending_burn");
  const canForge =
    data.open && data.signedIn && !!match?.craftable &&
    (data.remainingForUser == null || data.remainingForUser > 0) &&
    pending.length === 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <SiteHeader />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <Link href="/forge" className="text-xs text-zinc-500 hover:text-zinc-300">← All recipes</Link>

        {/* Hero */}
        <section
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/60 p-6 sm:p-8"
          style={{ backgroundImage: `radial-gradient(900px 240px at 50% -120px, ${accent}26 0%, transparent 65%)` }}>
          <div className="grid gap-6 sm:grid-cols-[1fr_220px]">
            <div>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{recipe.title}</h1>
              {recipe.subtitle && <p className="mt-1 text-sm text-zinc-400">{recipe.subtitle}</p>}
              {recipe.description && <p className="mt-3 text-sm text-zinc-400">{recipe.description}</p>}
              {recipe.requireSoldOrigin && (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-orange-500/10 px-2.5 py-1 text-[11px] font-medium text-orange-300">
                  Only moments acquired from us qualify for this forge.
                </p>
              )}
              <p className="mt-4 text-[11px] text-zinc-500">
                {recipe.totalCrafted} crafted{recipe.maxTotal != null ? ` / ${recipe.maxTotal}` : ""}
                {data.remainingForUser != null && ` · ${data.remainingForUser} craft(s) left for you`}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: accent }}>You forge</p>
              <div className="mt-2 aspect-square w-full overflow-hidden rounded-xl bg-black/40">
                {recipe.rewardImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={recipe.rewardImageUrl} alt="" className="h-full w-full object-cover" />
                ) : <div className="flex h-full items-center justify-center text-5xl">🎁</div>}
              </div>
              <p className="mt-2 truncate text-sm font-semibold text-zinc-100">{recipe.rewardTitle}</p>
              {recipe.rewardDescription && <p className="truncate text-[11px] text-zinc-500">{recipe.rewardDescription}</p>}
              {recipe.rewardMomentUrl && (
                <a href={recipe.rewardMomentUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-1 inline-block text-[11px] text-zinc-400 underline hover:text-zinc-200">View on Top Shot →</a>
              )}
            </div>
          </div>
        </section>

        {/* Requirements + eligibility */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-300">Moments to burn</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Burning is <span className="font-semibold text-zinc-300">permanent</span>. We auto-select your
            highest serial numbers so you keep your rarer copies.
          </p>

          <div className="mt-4 space-y-3">
            {recipe.inputs.map((g, i) => {
              const gm = match?.groups.find((x) => x.index === i);
              return (
                <div key={i} className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-zinc-200">
                      {g.count}× <span className="text-zinc-400">{groupLabel(g)}</span>
                    </p>
                    {match && (
                      <span className={
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                        (gm?.satisfied ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300")
                      }>
                        {gm?.satisfied ? "Ready" : `${gm?.candidateCount ?? 0}/${g.count} owned`}
                      </span>
                    )}
                  </div>
                  {gm && gm.selected.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {gm.selected.map((m) => (
                        <div key={m.momentID} className="flex items-center gap-2 rounded-lg bg-white/[0.04] p-1.5 pr-2.5">
                          {m.thumbnail && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.thumbnail} alt="" className="h-9 w-9 rounded object-cover" />
                          )}
                          <div className="text-[11px]">
                            <p className="text-zinc-200">{m.playerName ?? m.setName ?? `#${m.momentID}`}</p>
                            <p className="text-zinc-500">#{m.serialNumber}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action */}
          <div className="mt-5">
            {!data.signedIn ? (
              <p className="text-sm text-zinc-400">Sign in and verify your wallet to craft.</p>
            ) : data.soldOut ? (
              <p className="text-sm text-red-300">This forge is sold out.</p>
            ) : data.ended ? (
              <p className="text-sm text-red-300">This forge has closed.</p>
            ) : !data.open ? (
              <p className="text-sm text-zinc-400">This forge hasn&apos;t opened yet.</p>
            ) : pending.length > 0 ? (
              <p className="text-sm text-amber-300">You have a pending burn below — confirm or cancel it first.</p>
            ) : !match?.craftable ? (
              <p className="text-sm text-zinc-400">
                You don&apos;t own enough qualifying moments yet.{" "}
                <Link href="/dashboard" className="text-orange-300 hover:text-orange-200">Verify your wallet</Link> if you recently bought them.
              </p>
            ) : data.remainingForUser === 0 ? (
              <p className="text-sm text-zinc-400">You&apos;ve reached your craft limit for this recipe.</p>
            ) : (
              <button onClick={forge} disabled={busy || !canForge}
                className="rounded-xl px-5 py-2.5 text-sm font-bold text-white transition disabled:opacity-50"
                style={{ background: accent }}>
                {busy ? "Working…" : "Forge it 🔨"}
              </button>
            )}
          </div>
        </section>

        {/* Pending burns */}
        {pending.length > 0 && (
          <section className="rounded-2xl border border-amber-400/30 bg-amber-500/[0.06] p-5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-amber-300">Pending burn</h2>
            {pending.map((s) => (
              <div key={s.id} className="mt-3">
                <p className="text-sm text-zinc-300">
                  You committed to burn {s.committedMomentIds.length} moment(s):
                </p>
                <p className="mt-1 font-mono text-[11px] text-zinc-400">{s.committedMomentIds.join(", ")}</p>
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-zinc-400">
                  <li>Open NBA Top Shot and <span className="font-semibold text-zinc-200">burn / destroy</span> the moments listed above.</li>
                  <li>Come back and click <span className="font-semibold text-zinc-200">Confirm burn</span> — we&apos;ll verify on-chain.</li>
                  <li>An admin then airdrops your <span className="font-semibold" style={{ color: accent }}>{recipe.rewardTitle}</span>.</li>
                </ol>
                <div className="mt-4 flex gap-2">
                  <button onClick={() => confirmBurn(s.id)} disabled={busy}
                    className="rounded-lg bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50">
                    {busy ? "Checking…" : "Confirm burn"}
                  </button>
                  <button onClick={() => cancel(s.id)} disabled={busy}
                    className="rounded-lg bg-white/5 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10 disabled:opacity-50">
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* History */}
        {history.length > 0 && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-300">Your forge history</h2>
            <div className="mt-3 space-y-2">
              {history.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg bg-black/30 px-3 py-2 text-xs">
                  <span className="text-zinc-400">
                    {new Date(s.createdAt).toLocaleDateString()} · {s.committedMomentIds.length} burned
                    {s.adminNote && <span className="text-zinc-500"> · {s.adminNote}</span>}
                  </span>
                  <span className={
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
                    (s.status === "reward_sent" ? "bg-emerald-500/15 text-emerald-300"
                      : s.status === "burn_verified" ? "bg-amber-500/15 text-amber-300"
                      : s.status === "rejected" ? "bg-red-500/15 text-red-300"
                      : "bg-zinc-600/30 text-zinc-400")
                  }>
                    {s.status.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
