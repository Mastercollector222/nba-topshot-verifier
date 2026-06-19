"use client";

/**
 * components/RewardsPanel.tsx
 * ---------------------------------------------------------------------------
 * Renders the per-rule verification results: progress bar, status detail,
 * and an "earned" badge when the user qualifies.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { RewardRule, RuleEvaluation } from "@/lib/verify";
import { useCountdown } from "@/lib/useCountdown";
import { CountdownTimer } from "@/components/CountdownTimer";

interface Props {
  /** Evaluations from a completed /api/verify scan. Empty/undefined means
   *  the user hasn't scanned yet — the panel will fall back to `rules`. */
  evaluations?: RuleEvaluation[];
  earnedRewards?: string[];
  /** Rule catalog (public) — used to show challenge cards before any scan. */
  rules?: RewardRule[];
  /** True once a scan has completed; flips card chips from “Not scanned” → “Earned/%”. */
  scanned?: boolean;
  /** Controlled tab value. When provided, `onTabChange` must also be set. */
  tab?: TabKey;
  /** Callback fired when the user clicks a tab (controlled mode). */
  onTabChange?: (t: TabKey) => void;
}

export type TabKey = "moments" | "sets";

const TABS: { key: TabKey; label: string }[] = [
  { key: "moments", label: "Moment challenges" },
  { key: "sets",    label: "Set challenges" },
];

/** Maps a rule type to one of the two tabs. */
function ruleTab(type: string): TabKey {
  return type === "set_completion" ? "sets" : "moments";
}

interface ClaimRow {
  rule_id: string;
  topshot_username: string;
  status: "pending" | "sent" | "rejected";
  updated_at: string;
  ship_full_name?: string | null;
  ship_address_line1?: string | null;
  ship_address_line2?: string | null;
  ship_city?: string | null;
  ship_state?: string | null;
  ship_postal_code?: string | null;
  ship_country?: string | null;
  ship_phone?: string | null;
  ship_email?: string | null;
  ship_notes?: string | null;
}

function ruleSummary(e: RuleEvaluation): string {
  switch (e.rule.type) {
    case "specific_moments":
      return `Own ${e.rule.momentIds.length} specific Moment${e.rule.momentIds.length === 1 ? "" : "s"}`;
    case "set_completion":
      return `Complete ≥ ${e.rule.minPercent ?? 100}% of Set ${e.rule.setId}`;
    case "quantity": {
      const bits: string[] = [`Own ≥ ${e.rule.minCount}`];
      if (e.rule.setId !== undefined) bits.push(`from Set ${e.rule.setId}`);
      if (e.rule.playId !== undefined) bits.push(`of Play ${e.rule.playId}`);
      if (e.rule.series !== undefined) bits.push(`Series ${e.rule.series}`);
      if (e.rule.tier) bits.push(`tier "${e.rule.tier}"`);
      return bits.join(" ");
    }
  }
}

function prizeLine(e: RuleEvaluation): string | null {
  const r = e.rule as unknown as {
    rewardSetId?: number;
    rewardPlayId?: number;
    rewardDescription?: string;
  };
  const bits: string[] = [];
  if (r.rewardDescription) bits.push(r.rewardDescription);
  if (r.rewardSetId != null) bits.push(`set ${r.rewardSetId}`);
  if (r.rewardPlayId != null) bits.push(`play ${r.rewardPlayId}`);
  return bits.length ? bits.join(" · ") : null;
}

function prizeIds(
  e: RuleEvaluation,
): { setId: number | null; playId: number } | null {
  const r = e.rule as unknown as {
    rewardSetId?: number;
    rewardPlayId?: number;
  };
  // playId alone is enough — every Moment of the same play shares the same
  // thumbnail URL. setId is optional and only used as a tie-breaker.
  if (r.rewardPlayId == null) return null;
  return { setId: r.rewardSetId ?? null, playId: r.rewardPlayId };
}

/**
 * Try to derive a (setId, playId) pair that uniquely identifies the
 * Moment the *user must collect* for this rule. Used to render the
 * required-Moment thumbnail on the rewards card.
 *
 *   - quantity rules: only when both `setId` AND `playId` are set on the
 *     rule itself (i.e. "own N copies of this exact play").
 *   - other rule types are intentionally skipped — `specific_moments`
 *     keys on serial-level NFT ids and `set_completion` spans many plays,
 *     neither maps cleanly to a single thumbnail.
 */
function challengeIds(
  e: RuleEvaluation,
): { setId: number | null; playId: number | null } | null {
  // Quantity rules: single play thumbnail when playId is pinned.
  if (e.rule.type === "quantity") {
    const r = e.rule;
    if (r.playId == null) return null;
    return { setId: r.setId ?? null, playId: r.playId };
  }
  // Set completion: set-art fallback (or admin-supplied setImageUrl).
  if (e.rule.type === "set_completion") {
    return { setId: e.rule.setId, playId: null };
  }
  return null;
}

function requiresLock(e: RuleEvaluation): boolean {
  const r = e.rule as { requireLocked?: boolean; requireLockedUntil?: string };
  return r.requireLocked === true || r.requireLockedUntil != null;
}

function requireLockedUntil(e: RuleEvaluation): string | null {
  const r = e.rule as { requireLockedUntil?: string };
  return r.requireLockedUntil ?? null;
}

function setImageOverride(e: RuleEvaluation): string | null {
  const r = e.rule as unknown as { setImageUrl?: string };
  return r.setImageUrl?.trim() ? r.setImageUrl : null;
}

function expiresAt(e: RuleEvaluation | { rule: RewardRule }): string | null {
  const r = e.rule as unknown as { expiresAt?: string | null };
  return r.expiresAt ?? null;
}

function CountdownBadge({ iso }: { iso: string }) {
  const cd = useCountdown(iso);
  if (!cd) return null;
  return (
    <span
      className={
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] " +
        (cd.expired
          ? "border-red-500/40 bg-red-500/10 text-red-300"
          : "border-rose-400/40 bg-rose-400/10 text-rose-200")
      }
    >
      {cd.expired ? "Expired" : `⏰ ${cd.label}`}
    </span>
  );
}

function tsrPoints(e: RuleEvaluation): number {
  const r = e.rule as unknown as { tsrPoints?: number };
  return Math.max(0, Math.floor(r.tsrPoints ?? 0));
}

function rewardMomentUrl(e: RuleEvaluation): string | null {
  const r = e.rule as unknown as { rewardMomentUrl?: string };
  return r.rewardMomentUrl?.trim() ? r.rewardMomentUrl : null;
}

function challengeMomentUrl(e: RuleEvaluation): string | null {
  const r = e.rule as unknown as { challengeMomentUrl?: string };
  return r.challengeMomentUrl?.trim() ? r.challengeMomentUrl : null;
}

function isPhysicalReward(e: RuleEvaluation | { rule: RewardRule }): boolean {
  const r = e.rule as unknown as { isPhysical?: boolean };
  return r.isPhysical === true;
}

function physicalTitle(e: RuleEvaluation | { rule: RewardRule }): string | null {
  const r = e.rule as unknown as { physicalTitle?: string | null };
  return r.physicalTitle ?? null;
}

function physicalImage(e: RuleEvaluation | { rule: RewardRule }): string | null {
  const r = e.rule as unknown as { physicalImageUrl?: string | null };
  return r.physicalImageUrl ?? null;
}

/**
 * Tiny pill button that opens an NBA Top Shot listing in a new tab.
 * `noopener,noreferrer` are mandatory because we don't control the
 * destination and don't want it touching window.opener.
 */
function ViewOnTopShot({ href, tone }: { href: string; tone: "amber" | "orange" }) {
  const palette =
    tone === "amber"
      ? "border-amber-400/40 bg-amber-400/10 text-amber-100 hover:border-amber-300/70 hover:bg-amber-400/20"
      : "border-orange-400/40 bg-orange-500/10 text-orange-100 hover:border-orange-300/70 hover:bg-orange-500/20";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition " +
        palette
      }
    >
      View on Top Shot
      <svg
        viewBox="0 0 24 24"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M7 17 17 7" />
        <path d="M9 7h8v8" />
      </svg>
    </a>
  );
}

/**
 * Small thumbnail loader. Hits our cached `/api/moment-image` lookup which
 * re-uses any Top Shot CDN URL already stored in `owned_moments` for the
 * same (setId, playId). Renders a styled placeholder while the URL resolves
 * so layout doesn't jump.
 *
 * `tone` selects the accent ring + placeholder text:
 *   - "gold"   → prize Moment (gold ring, "Prize" placeholder)
 *   - "flame"  → required challenge Moment (orange ring, "Required" placeholder)
 */
function MomentThumbnail({
  setId,
  playId,
  tone,
  overrideUrl,
}: {
  setId: number | null;
  playId: number | null;
  tone: "gold" | "flame";
  overrideUrl?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(overrideUrl ?? null);
  useEffect(() => {
    // Admin-supplied URL wins — skip the network roundtrip.
    if (overrideUrl) {
      setUrl(overrideUrl);
      return;
    }
    if (playId == null && setId == null) return;
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (playId != null) params.set("playId", String(playId));
        if (setId != null) params.set("setId", String(setId));
        const res = await fetch(`/api/moment-image?${params.toString()}`, {
          cache: "default",
        });
        if (res.status !== 200) return;
        const body = (await res.json()) as { thumbnail?: string };
        if (!cancelled && body.thumbnail) setUrl(body.thumbnail);
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setId, playId, overrideUrl]);

  const ring = tone === "gold" ? "ring-gold" : "ring-flame";
  const bg =
    tone === "gold"
      ? "bg-gradient-to-br from-amber-500/30 to-amber-700/10"
      : "bg-gradient-to-br from-orange-500/30 to-red-700/10";
  const placeholderTone =
    tone === "gold" ? "text-amber-200/80" : "text-orange-200/80";
  const altLabel = tone === "gold" ? "Prize Moment" : "Required Moment";

  return (
    <div
      className={`relative aspect-square w-28 shrink-0 overflow-hidden rounded-xl ${bg} ${ring}`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={altLabel}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center text-[9px] uppercase tracking-widest ${placeholderTone}`}
        >
          {tone === "gold" ? "Prize" : "Required"}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent" />
    </div>
  );
}

export function RewardsPanel({
  evaluations,
  earnedRewards,
  rules,
  scanned: scannedProp,
  tab: controlledTab,
  onTabChange,
}: Props) {
  const [claims, setClaims] = useState<Record<string, ClaimRow>>({});
  const [internalTab, setInternalTab] = useState<TabKey>("moments");
  const tab: TabKey = controlledTab ?? internalTab;
  const setTab = (t: TabKey) => {
    if (onTabChange) onTabChange(t);
    else setInternalTab(t);
  };

  // Derive the working list of evaluations. When there are real eval results
  // we use them; otherwise we synthesize neutral ones from the rule catalog
  // so every card still renders in a “Not scanned yet” state.
  const hasEvals = Array.isArray(evaluations) && evaluations.length > 0;
  const scanned = scannedProp ?? hasEvals;
  const allEvals: RuleEvaluation[] = hasEvals
    ? (evaluations as RuleEvaluation[])
    : (rules ?? []).map((rule) => ({
        rule,
        earned: false,
        progress: 0,
        detail: scanned ? "Not earned" : "Scan to check your progress",
        matched: [],
      }));

  // Filter by selected tab.
  const filtered = allEvals.filter((e) => ruleTab(e.rule.type) === tab);
  const earnedCount = scanned
    ? (earnedRewards?.length ?? allEvals.filter((e) => e.earned).length)
    : 0;

  const refreshClaims = useCallback(async () => {
    try {
      const res = await fetch("/api/claims", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { claims: ClaimRow[] };
      const map: Record<string, ClaimRow> = {};
      for (const c of body.claims) map[c.rule_id] = c;
      setClaims(map);
    } catch {
      /* non-fatal: claim UI falls back to empty state */
    }
  }, []);

  useEffect(() => {
    void refreshClaims();
  }, [refreshClaims]);

  // Tab counts for the header pills.
  const tabCounts: Record<TabKey, number> = { moments: 0, sets: 0 };
  for (const e of allEvals) tabCounts[ruleTab(e.rule.type)] += 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-orange-400/90">
          Active challenges
        </span>
        <h2 className="text-2xl font-semibold tracking-tight">Rewards</h2>
        {scanned ? (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300">
            <span className="font-mono text-sm font-semibold text-gold">
              {earnedCount}
            </span>
            <span className="text-zinc-500">/ {allEvals.length} earned</span>
          </span>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-orange-400/30 bg-orange-400/10 px-2.5 py-1 text-[11px] text-orange-200">
            Scan to see your progress
          </span>
        )}
      </div>

      {/* Tab selector */}
      {allEvals.length > 0 ? (
        <div className="inline-flex w-fit items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={
                  "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition " +
                  (active
                    ? "bg-gradient-to-r from-orange-500 to-amber-500 text-black shadow-[0_4px_14px_-4px_rgba(251,146,60,0.55)]"
                    : "text-zinc-400 hover:text-zinc-200")
                }
              >
                {t.label}
                <span className={
                  "rounded-full px-1.5 py-0.5 text-[9px] font-mono " +
                  (active ? "bg-black/20 text-black" : "bg-white/10 text-zinc-400")
                }>
                  {tabCounts[t.key]}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {allEvals.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center">
          <p className="text-sm text-zinc-300">No rules configured</p>
          <p className="mt-1 text-xs text-zinc-500">
            Edit <span className="font-mono text-zinc-400">config/rewards.json</span>{" "}
            or use the admin panel to add reward rules.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-zinc-500">
          No {tab === "sets" ? "set" : "Moment"} challenges yet.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {filtered.map((e) => {
          const pct = Math.round(e.progress * 100);
          const prize = prizeIds(e);
          const challenge = challengeIds(e);
          const prizeUrl = rewardMomentUrl(e);
          const challengeUrl = challengeMomentUrl(e);
          return (
            <article
              key={e.rule.id}
              className={
                "group relative flex flex-col gap-3 overflow-hidden rounded-2xl p-5 transition " +
                (e.earned
                  ? "glass-strong ring-gold"
                  : "glass hover:-translate-y-0.5 hover:ring-white/15")
              }
            >
              {/* Ambient glow per earned state. */}
              <div
                aria-hidden
                className={
                  "pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl " +
                  (e.earned
                    ? "bg-amber-400/20"
                    : "bg-orange-500/10 opacity-0 transition group-hover:opacity-100")
                }
              />

              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* `text-balance` + line-clamp-3 lets long reward titles
                      wrap onto multiple lines instead of being cut off
                      with an ellipsis. */}
                  <h3
                    className={
                      "text-balance text-lg font-semibold leading-snug tracking-tight line-clamp-3 " +
                      (e.earned ? "text-gold" : "text-zinc-100")
                    }
                    title={e.rule.reward}
                  >
                    {e.rule.reward}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-400">
                    {ruleSummary(e)}
                  </p>
                  {expiresAt(e) ? (
                    <div className="mt-1.5">
                      <CountdownTimer expiresAt={expiresAt(e)} compact />
                    </div>
                  ) : null}
                </div>
                {tsrPoints(e) > 0 ? (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-300"
                    title="TSR points awarded on completion"
                  >
                    +{tsrPoints(e).toLocaleString()} TSR
                  </span>
                ) : null}
                {e.earned ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-200">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3 w-3"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M12 2 14.09 8.26 20.5 8.76 15.55 13.1 17.18 19.5 12 16 6.82 19.5 8.45 13.1 3.5 8.76 9.91 8.26z" />
                    </svg>
                    Earned
                  </span>
                ) : null}
                {isPhysicalReward(e) ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-purple-400/40 bg-purple-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-purple-200">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                    >
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    </svg>
                    Physical Prize
                  </span>
                ) : null}
                {!e.earned && !scanned ? (
                  <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
                    Not scanned
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] font-semibold text-zinc-200">
                    {pct}%
                  </span>
                )}
              </header>

              {/* Progress rail. We keep the shadcn <Progress> for accessibility
                  but layer a flame gradient track on top for branding. */}
              <div className="relative">
                <Progress
                  value={pct}
                  className="h-2 rounded-full bg-white/5 [&>*]:hidden"
                />
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
                  <div
                    className={
                      "h-full rounded-full transition-[width] duration-700 " +
                      (e.earned
                        ? "bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500"
                        : "bg-gradient-to-r from-orange-500 via-orange-500 to-red-500")
                    }
                    style={{ width: `${Math.max(pct, 3)}%` }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-zinc-400">{e.detail}</p>

              {/* Required (challenge) Moment — renders only when the rule
                  has a clean (setId, playId) target or an explicit URL.
                  Mirrors the prize-Moment card visually but in flame
                  orange to signal "this is what you need to collect". */}
              {challenge || challengeUrl ? (
                <div className="mt-1 flex items-start gap-3 rounded-xl border border-orange-400/15 bg-gradient-to-br from-orange-500/10 to-red-950/10 p-3">
                  {challenge ? (
                    <MomentThumbnail
                      setId={challenge.setId}
                      playId={challenge.playId}
                      tone="flame"
                      overrideUrl={setImageOverride(e)}
                    />
                  ) : null}
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-orange-300/80">
                      Required Moment
                      {requiresLock(e) ? (
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4 shrink-0 text-orange-400 drop-shadow-[0_0_3px_rgba(251,146,60,0.7)]"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden={false}
                        >
                          <title>Must be locked</title>
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      ) : null}
                    </span>
                    <p className="text-sm font-medium text-orange-100">
                      {ruleSummary(e)}
                    </p>
                    {challenge ? (
                      <p className="font-mono text-[10px] text-orange-200/60">
                        {challenge.setId != null
                          ? `set ${challenge.setId} · play ${challenge.playId}`
                          : `play ${challenge.playId}`}
                      </p>
                    ) : null}
                    {requireLockedUntil(e) ? (
                      <p className="font-mono text-[9px] text-orange-200/60">
                        Lock until {new Date(requireLockedUntil(e)!).toLocaleDateString()}
                      </p>
                    ) : null}
                    {challengeUrl ? (
                      <ViewOnTopShot href={challengeUrl} tone="orange" />
                    ) : null}
                  </div>
                </div>
              ) : null}

              {prizeLine(e) ? (
                <div className="mt-1 flex items-start gap-3 rounded-xl border border-amber-400/15 bg-gradient-to-br from-amber-500/10 to-amber-950/10 p-3">
                  {prize ? (
                    <MomentThumbnail
                      setId={prize.setId}
                      playId={prize.playId}
                      tone="gold"
                    />
                  ) : null}
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-amber-300/80">
                      Prize Moment
                    </span>
                    <p className="text-sm font-medium text-amber-100">
                      {prizeLine(e)}
                    </p>
                    {prize ? (
                      <p className="font-mono text-[10px] text-amber-200/60">
                        {prize.setId != null
                          ? `set ${prize.setId} · play ${prize.playId}`
                          : `play ${prize.playId}`}
                      </p>
                    ) : null}
                    {prizeUrl ? (
                      <ViewOnTopShot href={prizeUrl} tone="amber" />
                    ) : null}
                  </div>
                </div>
              ) : null}

              {e.earned ? (
                <ClaimForm
                  ruleId={e.rule.id}
                  existing={claims[e.rule.id]}
                  onSubmitted={refreshClaims}
                />
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Inline form for a winner to submit their NBA Top Shot username so the
 * admin can airdrop the prize. Shows the previously-submitted username if
 * the user has already claimed, plus status. For physical rewards, also
 * collects shipping address information.
 */
function ClaimForm({
  ruleId,
  existing,
  onSubmitted,
}: {
  ruleId: string;
  existing?: ClaimRow;
  onSubmitted: () => void | Promise<void>;
}) {
  const [username, setUsername] = useState(existing?.topshot_username ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  
  // Physical reward fields
  const [isPhysical, setIsPhysical] = useState(false);
  const [physicalTitle, setPhysicalTitle] = useState<string | null>(null);
  const [fullName, setFullName] = useState(existing?.ship_full_name ?? "");
  const [addressLine1, setAddressLine1] = useState(existing?.ship_address_line1 ?? "");
  const [addressLine2, setAddressLine2] = useState(existing?.ship_address_line2 ?? "");
  const [city, setCity] = useState(existing?.ship_city ?? "");
  const [state, setState] = useState(existing?.ship_state ?? "");
  const [postalCode, setPostalCode] = useState(existing?.ship_postal_code ?? "");
  const [country, setCountry] = useState(existing?.ship_country ?? "US");
  const [phone, setPhone] = useState(existing?.ship_phone ?? "");
  const [email, setEmail] = useState(existing?.ship_email ?? "");
  const [notes, setNotes] = useState(existing?.ship_notes ?? "");

  // Fetch rule info to check if physical
  useEffect(() => {
    async function fetchRule() {
      try {
        const res = await fetch("/api/rules", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { rules: Array<{ id: string; is_physical?: boolean; physical_title?: string | null }> };
        const rule = body.rules.find((r) => r.id === ruleId);
        if (rule) {
          setIsPhysical(rule.is_physical ?? false);
          setPhysicalTitle(rule.physical_title ?? null);
        }
      } catch {
        // Ignore error
      }
    }
    fetchRule();
  }, [ruleId]);

  useEffect(() => {
    if (existing?.topshot_username) setUsername(existing.topshot_username);
    if (existing?.ship_full_name) setFullName(existing.ship_full_name);
    if (existing?.ship_address_line1) setAddressLine1(existing.ship_address_line1);
    if (existing?.ship_address_line2) setAddressLine2(existing.ship_address_line2 ?? "");
    if (existing?.ship_city) setCity(existing.ship_city);
    if (existing?.ship_state) setState(existing.ship_state ?? "");
    if (existing?.ship_postal_code) setPostalCode(existing.ship_postal_code);
    if (existing?.ship_country) setCountry(existing.ship_country);
    if (existing?.ship_phone) setPhone(existing.ship_phone ?? "");
    if (existing?.ship_email) setEmail(existing.ship_email ?? "");
    if (existing?.ship_notes) setNotes(existing.ship_notes ?? "");
  }, [existing]);

  const submit = async () => {
    setMsg(null);
    const u = username.trim();
    if (!/^[A-Za-z0-9_.-]{2,40}$/.test(u)) {
      setMsg({ kind: "err", text: "Enter a valid Top Shot username." });
      return;
    }
    
    // Validate shipping if physical
    if (isPhysical) {
      if (!fullName.trim() || !addressLine1.trim() || !city.trim() || !postalCode.trim() || !country.trim()) {
        setMsg({ kind: "err", text: "Please fill in all required shipping fields (name, address, city, postal code, country)." });
        return;
      }
    }
    
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { ruleId, topshotUsername: u };
      if (isPhysical) {
        payload.shipping = {
          fullName: fullName.trim(),
          addressLine1: addressLine1.trim(),
          addressLine2: addressLine2.trim() || undefined,
          city: city.trim(),
          state: state.trim() || undefined,
          postalCode: postalCode.trim(),
          country: country.trim().toUpperCase(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          notes: notes.trim() || undefined,
        };
      }
      
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg({ kind: "err", text: body.error ?? `HTTP ${res.status}` });
        return;
      }
      setMsg({ kind: "ok", text: isPhysical ? "Submitted. We'll ship your prize soon!" : "Submitted. The admin will airdrop soon." });
      await onSubmitted();
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = existing ? (
    <Badge
      variant="outline"
      className={
        existing.status === "sent"
          ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
          : existing.status === "rejected"
            ? "border-red-500/40 text-red-600 dark:text-red-300"
            : "border-amber-500/40 text-amber-700 dark:text-amber-300"
      }
    >
      {existing.status}
    </Badge>
  ) : null;

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      {/* Physical reward notice */}
      {isPhysical && (
        <div className="mb-3 rounded-lg border border-purple-500/30 bg-purple-500/10 p-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-purple-300">
            🎁 Physical Prize: {physicalTitle || "Item to be shipped"}
          </p>
          <p className="text-[10px] text-purple-200/70">
            We'll ship this to you. Please provide your shipping address below.
          </p>
        </div>
      )}
      
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={`ts-${ruleId}`}
          className="text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400"
        >
          Top Shot username
        </label>
        {statusBadge}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Input
          id={`ts-${ruleId}`}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. CourtsideKing"
          disabled={busy || existing?.status === "sent"}
          className="h-9 rounded-full border-white/10 bg-white/5 text-xs text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-amber-400/50"
        />
      </div>
      
      {/* Shipping address form for physical rewards */}
      {isPhysical && (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400">
            Shipping Address
          </p>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name *"
            disabled={busy || existing?.status === "sent"}
            className="h-9 rounded-full border-white/10 bg-white/5 text-xs text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-purple-400/50"
          />
          <Input
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            placeholder="Address line 1 *"
            disabled={busy || existing?.status === "sent"}
            className="h-9 rounded-full border-white/10 bg-white/5 text-xs text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-purple-400/50"
          />
          <Input
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            placeholder="Address line 2 (optional)"
            disabled={busy || existing?.status === "sent"}
            className="h-9 rounded-full border-white/10 bg-white/5 text-xs text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-purple-400/50"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City *"
              disabled={busy || existing?.status === "sent"}
              className="h-9 rounded-full border-white/10 bg-white/5 text-xs text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-purple-400/50"
            />
            <Input
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="State/Province"
              disabled={busy || existing?.status === "sent"}
              className="h-9 rounded-full border-white/10 bg-white/5 text-xs text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-purple-400/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="Postal code *"
              disabled={busy || existing?.status === "sent"}
              className="h-9 rounded-full border-white/10 bg-white/5 text-xs text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-purple-400/50"
            />
            <Input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Country (2-letter code, e.g. US) *"
              maxLength={2}
              disabled={busy || existing?.status === "sent"}
              className="h-9 rounded-full border-white/10 bg-white/5 text-xs text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-purple-400/50"
            />
          </div>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (optional)"
            disabled={busy || existing?.status === "sent"}
            className="h-9 rounded-full border-white/10 bg-white/5 text-xs text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-purple-400/50"
          />
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            disabled={busy || existing?.status === "sent"}
            className="h-9 rounded-full border-white/10 bg-white/5 text-xs text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-purple-400/50"
          />
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Delivery notes (optional)"
            disabled={busy || existing?.status === "sent"}
            className="h-9 rounded-full border-white/10 bg-white/5 text-xs text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-purple-400/50"
          />
        </div>
      )}
      
      <div className="mt-3">
        <Button
          size="sm"
          onClick={submit}
          disabled={busy || existing?.status === "sent"}
          className="h-9 w-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-4 text-[11px] font-semibold text-black hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "…" : isPhysical ? "Submit claim with shipping" : existing ? "Update" : "Claim prize"}
        </Button>
      </div>
      
      {msg ? (
        <p
          className={
            "mt-2 text-[11px] " +
            (msg.kind === "err"
              ? "text-red-500"
              : "text-emerald-600 dark:text-emerald-400")
          }
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}

export default RewardsPanel;
