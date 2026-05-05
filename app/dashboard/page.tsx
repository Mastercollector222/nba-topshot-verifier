"use client";

/**
 * app/dashboard/page.tsx
 * ---------------------------------------------------------------------------
 * Three-state dashboard:
 *
 *   A. Wallet not connected → show ConnectWallet CTA.
 *   B. Wallet connected, Supabase session NOT yet established → show
 *      SignInWithFlow (sign a nonce to prove ownership of the address).
 *   C. Signed in → show the verification panel: "Refresh verification"
 *      button, rewards panel, and the Moments grid. All data comes from
 *      POST /api/verify (authenticated, server verifies identity from the
 *      cookie — client cannot spoof a different address).
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Skeleton } from "@/components/Skeleton";
import { toast } from "@/components/Toaster";
import { fcl } from "@/lib/flow";
import { Button } from "@/components/ui/button";
import { SignInWithFlow } from "@/components/SignInWithFlow";
import { MomentsGrid } from "@/components/MomentsGrid";
import { PortfolioOverview } from "@/components/PortfolioOverview";
import { RewardsPanel, type TabKey } from "@/components/RewardsPanel";
import { SiteHeader } from "@/components/SiteHeader";
import { TopShotUsernameWidget } from "@/components/TopShotUsernameWidget";
import { useMarketData } from "@/lib/marketData";
import type { OwnedMoment } from "@/lib/topshot";
import {
  challengeMomentIds as computeChallengeMomentIds,
  nearMissMomentIds as computeNearMissMomentIds,
  type RewardRule,
  type RuleEvaluation,
} from "@/lib/verify";

interface FlowUser {
  addr: string | null;
  loggedIn: boolean;
}

// Background-job state surfaced by GET /api/verify/jobs/[id].
// Mirrors the shape returned by that endpoint; kept inline because it
// only matters for this page's progress UI.
interface VerifyJobState {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  phase:
    | "queued"
    | "enumerating"
    | "metadata"
    | "lockstate"
    | "persisting"
    | "succeeded"
    | null;
  fetched: number;
  total: number;
  newCount: number;
  existingCount: number;
  removedCount: number;
  fullRescan: boolean;
  error: string | null;
}

interface VerifyResponse {
  address: string;
  moments: OwnedMoment[];
  evaluations: RuleEvaluation[];
  earnedRewards: string[];
  challengeMomentIds?: string[];
  nearMissMomentIds?: string[];
  /** Aggregate TSR points from rule completions + admin adjustments. */
  tsr?: {
    total: number;
    fromChallenges: number;
    fromAdjustments: number;
  };
  cached?: boolean;
  lastVerifiedAt?: string | null;
}

export default function DashboardPage() {
  const [wallet, setWallet] = useState<FlowUser>({ addr: null, loggedIn: false });
  const [sessionAddr, setSessionAddr] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [data, setData] = useState<VerifyResponse | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [job, setJob] = useState<VerifyJobState | null>(null);
  const [rules, setRules] = useState<RewardRule[]>([]);
  const [challengeTab, setChallengeTab] = useState<TabKey>("moments");
  const [stats, setStats] = useState<{
    streakDays: number;
    tsrTotal: number;
    tsrPercentile: number | null;
  } | null>(null);
  const [activity, setActivity] = useState<
    Array<{ type: "scan" | "completion"; at: string; label: string }>
  | null>(null);

  // Filter challenge/near-miss Moment highlights by the active tab so the
  // MomentsGrid only outlines Moments tied to the rule type the user is
  // currently viewing. Recomputed client-side from the evaluations (which
  // include the full rule object) so it stays in sync with any rule edits.
  const filteredChallengeIds = useMemo<string[]>(() => {
    if (!data) return [];
    const tabRules = data.evaluations
      .filter((e) =>
        challengeTab === "sets"
          ? e.rule.type === "set_completion"
          : e.rule.type !== "set_completion",
      )
      .map((e) => e.rule);
    return [...computeChallengeMomentIds(data.moments, tabRules)];
  }, [data, challengeTab]);

  const filteredNearMissIds = useMemo<string[]>(() => {
    if (!data) return [];
    const tabRules = data.evaluations
      .filter((e) =>
        challengeTab === "sets"
          ? e.rule.type === "set_completion"
          : e.rule.type !== "set_completion",
      )
      .map((e) => e.rule);
    return [...computeNearMissMomentIds(data.moments, tabRules)];
  }, [data, challengeTab]);

  // Feature #7 — fetch live floor prices + trend for every owned Moment.
  // Re-fires whenever the verifier returns a new collection. The hook
  // dedupes moments into unique editions internally so a 13k-moment
  // portfolio only triggers a few hundred upstream lookups.
  const market = useMarketData(data?.moments);

  // Fetch the public rule catalog once on mount so we can render the
  // "Active challenges" grid before the user scans.
  useEffect(() => {
    fetch("/api/rules")
      .then((r) => r.json())
      .then((d: { rules?: RewardRule[] }) => setRules(d.rules ?? []))
      .catch(() => setRules([]));
  }, []);

  // Subscribe to wallet auth state.
  useEffect(() => {
    const unsub = fcl.currentUser.subscribe((u: FlowUser) => {
      setWallet({ addr: u?.addr ?? null, loggedIn: Boolean(u?.loggedIn) });
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  // Check Supabase session on mount and whenever wallet changes (in case
  // the user just signed in or signed out).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/session", { cache: "no-store" });
        const { address } = (await res.json()) as { address: string | null };
        if (!cancelled) {
          setSessionAddr(address);
          setSessionChecked(true);
        }
      } catch {
        if (!cancelled) {
          setSessionAddr(null);
          setSessionChecked(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet.addr]);

  // Fetch per-user stats (streak + TSR percentile) once signed in.
  useEffect(() => {
    if (!sessionAddr) return;
    let cancelled = false;
    fetch("/api/me/stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { streakDays: number; tsrTotal: number; tsrPercentile: number | null }) => {
        if (!cancelled) setStats(d);
      })
      .catch(() => { /* tolerated */ });
    return () => { cancelled = true; };
  }, [sessionAddr]);

  // Fetch recent activity once signed in.
  useEffect(() => {
    if (!sessionAddr) return;
    let cancelled = false;
    fetch("/api/me/activity", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { items: Array<{ type: "scan" | "completion"; at: string; label: string }> }) => {
        if (!cancelled) setActivity(d.items ?? []);
      })
      .catch(() => { /* tolerated */ });
    return () => { cancelled = true; };
  }, [sessionAddr]);

  const runVerify = useCallback(async () => {
    setVerifying(true);
    setJob(null);
    try {
      // Step 1: kick off a background scan. Returns immediately with a
      // job id we'll poll for progress until it finishes.
      const startRes = await fetch("/api/verify", { method: "POST" });
      if (startRes.status !== 202 && !startRes.ok) {
        const body = (await startRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Verification failed (${startRes.status})`);
      }
      const { jobId } = (await startRes.json()) as { jobId: string };

      // Step 2: poll the job status until terminal. ~1.5s cadence keeps
      // the UI feeling live without hammering the DB. We bail out after
      // ~6 minutes — enough for a 67k whale's first scan plus headroom.
      const POLL_MS = 1500;
      const MAX_TRIES = Math.ceil((6 * 60_000) / POLL_MS);
      let final: VerifyJobState | null = null;
      for (let i = 0; i < MAX_TRIES; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const pollRes = await fetch(`/api/verify/jobs/${jobId}`, {
          cache: "no-store",
        });
        if (!pollRes.ok) {
          const body = (await pollRes.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `Poll failed (${pollRes.status})`);
        }
        const state = (await pollRes.json()) as VerifyJobState;
        setJob(state);
        if (state.status === "succeeded" || state.status === "failed") {
          final = state;
          break;
        }
      }

      if (!final) {
        throw new Error(
          "Scan is taking longer than expected. Check back in a minute and refresh.",
        );
      }
      if (final.status === "failed") {
        throw new Error(final.error ?? "Scan failed");
      }

      // Step 3: pull the freshly-materialised snapshot via the cached
      // GET path. The dashboard's existing useEffect would do this on
      // its own but we want immediate visibility post-scan.
      const cachedRes = await fetch("/api/verify", { cache: "no-store" });
      if (!cachedRes.ok) {
        throw new Error(`Failed to load snapshot (${cachedRes.status})`);
      }
      const payload = (await cachedRes.json()) as VerifyResponse;
      setData(payload);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Verification failed", "error");
    } finally {
      setVerifying(false);
      // Keep the final job object on screen briefly so the user sees the
      // success state, then clear it.
      setTimeout(() => setJob(null), 2000);
    }
  }, []);

  // On first entry once signed in: try the cached snapshot first (fast —
  // just reads Supabase), only kick off a fresh chain scan if nothing is
  // cached yet. The Refresh button always triggers a fresh scan.
  useEffect(() => {
    if (!sessionAddr || data || verifying) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/verify", { cache: "no-store" });
        if (res.status === 204) {
          if (!cancelled) void runVerify();
          return;
        }
        if (!res.ok) throw new Error(`cache read ${res.status}`);
        const payload = (await res.json()) as VerifyResponse;
        if (!cancelled) setData(payload);
      } catch {
        if (!cancelled) void runVerify();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionAddr, data, verifying, runVerify]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader subtitle="Dashboard" />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-10">
        {/* State A — wallet not connected */}
        {!wallet.loggedIn ? (
          <section className="glass-strong relative flex flex-col items-start gap-3 overflow-hidden rounded-2xl p-10">
            <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-orange-500/15 blur-3xl" />
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-orange-400/90">
              Step 1 · Connect
            </span>
            <h2 className="text-3xl font-semibold tracking-tight">
              Connect your Flow wallet
            </h2>
            <p className="max-w-xl text-sm text-zinc-300/80">
              Use the Connect Wallet button in the header to sign in with
              Dapper — or any Flow wallet — and start scanning your Moments.
            </p>
          </section>
        ) : null}

        {/* State B — connected but not signed into Supabase */}
        {wallet.loggedIn && sessionChecked && !sessionAddr ? (
          <section className="glass-strong relative flex flex-col gap-4 overflow-hidden rounded-2xl p-10">
            <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-amber-400/15 blur-3xl" />
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-amber-400/90">
              Step 2 · Prove ownership
            </span>
            <h2 className="text-3xl font-semibold tracking-tight">
              Sign a one-time message
            </h2>
            <p className="max-w-xl text-sm text-zinc-300/80">
              Sign a quick wallet message to bind this session to{" "}
              <span className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-xs text-orange-300">
                {wallet.addr}
              </span>
              . No transaction is submitted — the signature only proves
              address ownership.
            </p>
            <div className="pt-2">
              <SignInWithFlow />
            </div>
          </section>
        ) : null}

        {/* State C — signed in */}
        {sessionAddr ? (
          <>
            <section className="glass-strong relative flex flex-col gap-6 overflow-hidden rounded-2xl p-6 sm:p-8">
              <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-orange-500/15 blur-3xl" />
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-orange-400/90">
                    Live verification
                  </span>
                  <h2 className="text-3xl font-semibold tracking-tight">
                    Your collection,{" "}
                    <span className="text-flame">verified.</span>
                  </h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    Scanning{" "}
                    <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-orange-300">
                      {sessionAddr}
                    </span>
                    {" "}plus all Hybrid-Custody child accounts.
                  </p>
                  {/* Verified Top Shot username — once linked, surfaces
                      across the leaderboard and admin console. */}
                  <div className="mt-3">
                    <TopShotUsernameWidget />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-5">
                  {data ? (
                    <>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                          Moments scanned
                        </span>
                        <span className="font-mono text-2xl font-semibold text-zinc-100">
                          {data.moments.length.toLocaleString()}
                        </span>
                      </div>
                      {/* Challenges-completed stat — flame-tinted so it
                          reads as the user's marquee number. Mirrors the
                          aggregate column shown on the public leaderboard. */}
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-amber-300/90">
                          Challenges completed
                        </span>
                        <span className="font-mono text-2xl font-semibold text-gold">
                          {data.earnedRewards.length.toLocaleString()}
                          <span className="ml-1 text-sm text-zinc-500">
                            / {data.evaluations.length}
                          </span>
                        </span>
                      </div>
                      {/* TSR balance — the user's lifetime points score.
                          Earned from rule completions + admin grants. */}
                      <div
                        className="flex flex-col items-end gap-0.5"
                        title={
                          data.tsr
                            ? `${data.tsr.fromChallenges.toLocaleString()} from challenges` +
                              (data.tsr.fromAdjustments !== 0
                                ? ` · ${data.tsr.fromAdjustments > 0 ? "+" : ""}${data.tsr.fromAdjustments.toLocaleString()} adjustments`
                                : "")
                            : undefined
                        }
                      >
                        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-amber-300/90">
                          TSR points
                        </span>
                        <span className="font-mono text-2xl font-semibold text-gold">
                          {(data.tsr?.total ?? 0).toLocaleString()}
                        </span>
                        {stats?.tsrPercentile != null ? (
                          <span className="mt-0.5 text-[10px] text-zinc-400">
                            {stats.tsrPercentile >= 75
                              ? `Top ${100 - stats.tsrPercentile}%`
                              : `Above ${stats.tsrPercentile}% of collectors`}
                          </span>
                        ) : null}
                      </div>
                      {/* Streak counter — hide when streak is 0 */}
                      {stats != null && stats.streakDays > 0 ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-amber-300/90">
                            Streak
                          </span>
                          <span className="font-mono text-2xl font-semibold text-gold">
                            🔥 {stats.streakDays}{" "}
                            <span className="text-sm text-zinc-400">
                              {stats.streakDays === 1 ? "day" : "days"}
                            </span>
                          </span>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  <Button
                    onClick={runVerify}
                    disabled={verifying}
                    className="h-10 rounded-full border-0 bg-gradient-to-r from-orange-500 to-red-500 px-5 text-sm font-semibold text-black shadow-[0_8px_24px_-8px_rgba(251,113,38,0.7)] hover:brightness-110"
                  >
                    {verifying ? "Scanning…" : "Refresh scan"}
                  </Button>
                </div>
              </div>
              {data?.lastVerifiedAt ? (
                <p className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">
                  Last verified{" "}
                  <span className="text-zinc-300">
                    {new Date(data.lastVerifiedAt).toLocaleString()}
                  </span>
                  {data.cached ? (
                    <span className="ml-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-zinc-400">
                      cached
                    </span>
                  ) : null}
                </p>
              ) : null}
            </section>

            {data ? (
              <>
                {/* Recent activity feed */}
                {activity !== null ? (
                  <RecentActivity items={activity} />
                ) : null}

                {/* Feature #7 — Portfolio Overview. Sits above the
                    rewards panel so users see total value first. */}
                <PortfolioOverview
                  moments={data.moments}
                  marketData={market.data}
                  loading={market.loading}
                  error={market.error}
                />
                <RewardsPanel
                  evaluations={data.evaluations}
                  earnedRewards={data.earnedRewards}
                  rules={rules}
                  scanned
                  tab={challengeTab}
                  onTabChange={setChallengeTab}
                />
                <MomentsGrid
                  moments={data.moments}
                  challengeMomentIds={filteredChallengeIds}
                  nearMissMomentIds={filteredNearMissIds}
                  marketData={market.data}
                  evaluations={data.evaluations}
                />
              </>
            ) : verifying ? (
              <>
                <ScanProgress job={job} />
                {/* Pre-scan challenge list stays visible while the job runs */}
                {rules.length > 0 ? (
                  <RewardsPanel
                    rules={rules}
                    scanned={false}
                    tab={challengeTab}
                    onTabChange={setChallengeTab}
                  />
                ) : (
                  <Skeleton className="h-64 w-full rounded-2xl" />
                )}
              </>
            ) : (
              /* Welcome empty state — signed in but no scan yet */
              <>
                <div className="glass rounded-2xl p-8 text-center">
                  <div className="text-5xl">👋</div>
                  <h3 className="mt-4 text-xl font-semibold tracking-tight">Welcome! Let&apos;s scan your collection</h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-400">Browse the active challenges below, then hit the button above to verify your NBA Top Shot Moments.</p>
                </div>
                {rules.length > 0 ? (
                  <RewardsPanel
                    rules={rules}
                    scanned={false}
                    tab={challengeTab}
                    onTabChange={setChallengeTab}
                  />
                ) : null}
              </>
            )}
          </>
        ) : null}
      </main>

      <footer className="border-t border-white/5 px-6 py-5 text-center text-[11px] tracking-wide text-zinc-500">
        Top Shot ·{" "}
        <span className="font-mono">0x0b2a3299cc857e29</span>
        {" · "}Hybrid Custody ·{" "}
        <span className="font-mono">0xd8a7e05a7ac670c0</span>
      </footer>
    </div>
  );
}

/**
 * Progress card shown while a background verify job is running. Reads
 * the latest poll snapshot and renders a per-phase progress bar plus
 * informational counters (new / refreshed / removed). When `job` is
 * null we render a generic "queued" state — gives the user immediate
 * feedback in the ~1.5s before the first poll lands.
 */
function ScanProgress({ job }: { job: VerifyJobState | null }) {
  const phaseLabel = (() => {
    switch (job?.phase) {
      case "enumerating":
        return "Listing your accounts on Flow";
      case "metadata":
        return "Fetching new Moment metadata";
      case "lockstate":
        return "Refreshing lock state on existing Moments";
      case "persisting":
        return "Saving snapshot";
      case "succeeded":
        return "Done";
      case "queued":
      default:
        return "Queued";
    }
  })();

  const pct =
    job && job.total > 0
      ? Math.min(100, Math.round((job.fetched / job.total) * 100))
      : 0;

  return (
    <div className="glass flex flex-col items-center gap-5 rounded-2xl p-12 text-center">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 rounded-full border-2 border-white/10" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-orange-400" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm font-medium text-zinc-100">{phaseLabel}</p>
        {job && job.total > 0 ? (
          <p className="font-mono text-xs text-zinc-400">
            {job.fetched.toLocaleString()} / {job.total.toLocaleString()}
          </p>
        ) : (
          <p className="text-xs text-zinc-500">
            Querying Flow mainnet — this can take a few minutes for very
            large collections.
          </p>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-300 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Counters — only meaningful once enumeration has finished */}
      {job &&
      (job.newCount > 0 || job.existingCount > 0 || job.removedCount > 0) ? (
        <div className="flex flex-wrap items-center justify-center gap-2 text-[11px]">
          {job.newCount > 0 ? (
            <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 font-mono uppercase tracking-wider text-emerald-200">
              +{job.newCount.toLocaleString()} new
            </span>
          ) : null}
          {job.existingCount > 0 ? (
            <span className="rounded-full border border-zinc-400/30 bg-white/5 px-2.5 py-1 font-mono uppercase tracking-wider text-zinc-300">
              {job.existingCount.toLocaleString()} unchanged
            </span>
          ) : null}
          {job.removedCount > 0 ? (
            <span className="rounded-full border border-rose-400/40 bg-rose-400/10 px-2.5 py-1 font-mono uppercase tracking-wider text-rose-200">
              -{job.removedCount.toLocaleString()} removed
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent activity feed
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

const ACTIVITY_ICONS: Record<"scan" | "completion", string> = {
  scan: "\uD83D\uDD0D",
  completion: "\uD83C\uDFC6",
};

function RecentActivity({
  items,
}: {
  items: Array<{ type: "scan" | "completion"; at: string; label: string }>;
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
        Recent activity
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-500">No activity yet</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {items.map((item, i) => (
            <li
              key={`${item.type}-${item.at}-${i}`}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base leading-none">
                  {ACTIVITY_ICONS[item.type]}
                </span>
                <span className="text-xs text-zinc-200">{item.label}</span>
              </div>
              <span className="shrink-0 text-[11px] text-zinc-500">
                {relativeTime(item.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
