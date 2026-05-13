"use client";

/**
 * app/milestones/page.tsx
 * ---------------------------------------------------------------------------
 * User-facing TSR milestones page. Shows:
 *   - User's current TSR total
 *   - All enabled milestones with progress bars
 *   - Claim button for unlocked milestones
 *   - Checkmark for already-claimed milestones
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { SkeletonMilestoneCard } from "@/components/skeletons";

interface Milestone {
  id: string;
  threshold: number;
  reward_label: string;
  bonus_tsr: number;
  moment_description: string | null;
}

interface Claim {
  milestone_id: string;
  status: "pending" | "fulfilled";
  topshot_username: string;
}

interface PageData {
  milestones: Milestone[];
  claims: Claim[];
  tsrTotal: number;
  signedIn: boolean;
}

export default function MilestonesPage() {
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [milestonesRes, statsRes, claimsRes] = await Promise.all([
        fetch("/api/milestones"),
        fetch("/api/me/stats"),
        fetch("/api/milestones/claims"),
      ]);

      const milestonesData = milestonesRes.ok ? await milestonesRes.json() : { milestones: [] };
      const statsData = statsRes.ok ? await statsRes.json() : null;
      const claimsData = claimsRes.ok ? await claimsRes.json() : { claims: [] };

      setData({
        milestones: milestonesData.milestones ?? [],
        claims: claimsData.claims ?? [],
        tsrTotal: statsData?.tsrTotal ?? 0,
        signedIn: statsRes.ok,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleClaim(milestoneId: string) {
    if (!username.trim()) {
      setMessage({ kind: "error", text: "Please enter your Top Shot username." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch("/api/milestones/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestoneId, topshotUsername: username.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Claim failed");
      setMessage({
        kind: "ok",
        text: `Claimed! ${d.bonusTsr > 0 ? `+${d.bonusTsr} bonus TSR awarded.` : ""}`,
      });
      setClaimingId(null);
      setUsername("");
      load();
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[oklch(0.08_0.008_265)] text-zinc-100">
      <SiteHeader subtitle="Milestones" />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">

        {/* Header */}
        <div className="mb-8">
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-orange-400/90">
            TSR Milestones
          </span>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Earn rewards as you grow.
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Accumulate TSR points by completing challenges. Hit each milestone threshold to
            claim a moment airdrop and bonus TSR points.
          </p>
        </div>

        {message ? (
          <div
            className={
              "mb-6 rounded-xl border px-4 py-3 text-sm " +
              (message.kind === "error"
                ? "border-red-500/30 bg-red-500/10 text-red-300"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300")
            }
          >
            {message.text}
          </div>
        ) : null}

        {/* TSR total card */}
        {data?.signedIn ? (
          <div className="mb-8 flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.04] px-6 py-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">Your TSR Balance</p>
              <p className="mt-0.5 font-mono text-4xl font-semibold tabular-nums text-orange-300">
                {(data.tsrTotal ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="text-right text-xs text-zinc-500">
              {data.milestones.filter(
                (m) =>
                  data.tsrTotal >= m.threshold &&
                  !data.claims.find((c) => c.milestone_id === m.id)
              ).length > 0 ? (
                <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-amber-200">
                  Milestone{data.milestones.filter(m => data.tsrTotal >= m.threshold && !data.claims.find(c => c.milestone_id === m.id)).length > 1 ? "s" : ""} ready to claim!
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonMilestoneCard key={i} />
            ))}
          </div>
        ) : !data?.signedIn ? (
          <div className="py-16 text-center text-zinc-400">
            Sign in to see your progress and claim milestones.
          </div>
        ) : data.milestones.length === 0 ? (
          <div className="py-16 text-center text-zinc-500">
            No milestones set yet. Check back soon!
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {data.milestones
              .sort((a, b) => a.threshold - b.threshold)
              .map((m) => {
                const claim = data.claims.find((c) => c.milestone_id === m.id);
                const unlocked = data.tsrTotal >= m.threshold;
                const pct = Math.min(100, Math.round((data.tsrTotal / m.threshold) * 100));
                const isClaiming = claimingId === m.id;

                return (
                  <div
                    key={m.id}
                    className={
                      "relative overflow-hidden rounded-2xl border p-5 transition " +
                      (claim
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : unlocked
                        ? "border-amber-400/30 bg-amber-400/5"
                        : "border-white/5 bg-white/[0.03]")
                    }
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {claim ? (
                            <span className="text-lg text-emerald-400">✓</span>
                          ) : unlocked ? (
                            <span className="text-lg text-amber-300">🏆</span>
                          ) : (
                            <span className="text-lg text-zinc-500">🔒</span>
                          )}
                          <span className="font-mono text-lg font-semibold text-orange-300">
                            {m.threshold.toLocaleString()} TSR
                          </span>
                        </div>
                        <p className="text-sm font-medium text-zinc-100">{m.reward_label}</p>
                        {m.moment_description ? (
                          <p className="text-xs text-zinc-400">{m.moment_description}</p>
                        ) : null}
                        {m.bonus_tsr > 0 ? (
                          <p className="text-[11px] text-emerald-400">
                            +{m.bonus_tsr} bonus TSR on claim
                          </p>
                        ) : null}
                        {claim ? (
                          <p className="text-[11px] text-zinc-400">
                            Claimed as{" "}
                            <span className="text-zinc-200">@{claim.topshot_username}</span>{" "}
                            · Status:{" "}
                            <span className={claim.status === "fulfilled" ? "text-emerald-300" : "text-amber-300"}>
                              {claim.status}
                            </span>
                          </p>
                        ) : null}
                      </div>

                      {!claim && unlocked ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            setClaimingId(isClaiming ? null : m.id);
                            setMessage(null);
                          }}
                        >
                          {isClaiming ? "Cancel" : "Claim Reward"}
                        </Button>
                      ) : null}
                    </div>

                    {/* Progress bar */}
                    {!claim ? (
                      <div className="mt-4">
                        <div className="mb-1 flex justify-between text-[10px] text-zinc-500">
                          <span>{data.tsrTotal.toLocaleString()} / {m.threshold.toLocaleString()} TSR</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                          <div
                            className={
                              "h-full rounded-full transition-all " +
                              (unlocked ? "bg-amber-400" : "bg-orange-500/60")
                            }
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    ) : null}

                    {/* Claim form */}
                    {isClaiming && !claim ? (
                      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/5 pt-4">
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="Your Top Shot username"
                          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-orange-400/50 focus:outline-none"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleClaim(m.id)}
                          disabled={busy}
                        >
                          {busy ? "Submitting…" : "Submit Claim"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
          </div>
        )}
      </main>
    </div>
  );
}
