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

import { useCallback, useEffect, useState } from "react";

import { fcl } from "@/lib/flow";
import { Button } from "@/components/ui/button";
import { SignInWithFlow } from "@/components/SignInWithFlow";
import { MomentsGrid } from "@/components/MomentsGrid";
import { RewardsPanel } from "@/components/RewardsPanel";
import { SiteHeader } from "@/components/SiteHeader";
import { TopShotUsernameWidget } from "@/components/TopShotUsernameWidget";
import type { OwnedMoment } from "@/lib/topshot";
import type { RuleEvaluation } from "@/lib/verify";

interface FlowUser {
  addr: string | null;
  loggedIn: boolean;
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
  const [error, setError] = useState<string | null>(null);

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

  const runVerify = useCallback(async () => {
    setError(null);
    setVerifying(true);
    try {
      const res = await fetch("/api/verify", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Verification failed (${res.status})`);
      }
      const payload = (await res.json()) as VerifyResponse;
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setVerifying(false);
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
                      </div>
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
              {error ? (
                <p
                  className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
            </section>

            {data ? (
              <>
                <RewardsPanel
                  evaluations={data.evaluations}
                  earnedRewards={data.earnedRewards}
                />
                <MomentsGrid
                  moments={data.moments}
                  challengeMomentIds={data.challengeMomentIds}
                  nearMissMomentIds={data.nearMissMomentIds}
                />
              </>
            ) : verifying ? (
              <div className="glass flex flex-col items-center gap-4 rounded-2xl p-16 text-center">
                <div className="relative h-10 w-10">
                  <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                  <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-orange-400" />
                </div>
                <p className="text-sm text-zinc-300">
                  Querying Flow mainnet — this can take a few seconds for
                  large collections.
                </p>
              </div>
            ) : null}
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
