"use client";

/**
 * /treasure-hunt/[id]
 * ---------------------------------------------------------------------------
 * Themed detail page for a single Treasure Hunt. Re-uses the listing API
 * (/api/treasure-hunts) so we keep one source of truth for evaluation;
 * we just pluck the matching hunt by id client-side. (For most users the
 * list of active hunts is small — < 10 — so this is fine.)
 *
 * Visual concept:
 *   - Dark navy + amber/gold parchment palette.
 *   - Hero: prize image, prize title, animated countdown.
 *   - Per-task "treasure chest" rows: locked → glowing → opened-with-loot
 *     based on `earned`. Progress bar inside each chest.
 *   - Big "Enter the drawing" CTA at the bottom; disabled until every
 *     task is earned and the gates pass; shows "You're entered!" once
 *     the entry is recorded.
 * ---------------------------------------------------------------------------
 */

import Link from "next/link";
import { use, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  Sparkles,
  Trophy,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { Countdown } from "@/components/Countdown";

interface RuleEvalLite {
  earned: boolean;
  progress: number;
  detail: string;
  rule: {
    id: string;
    reward: string;
    type: string;
  } & Record<string, unknown>;
}

interface HuntProgressDto {
  hunt: {
    id: string;
    title: string;
    theme: string | null;
    description: string | null;
    prizeTitle: string;
    prizeDescription: string | null;
    prizeImageUrl: string | null;
    startsAt: string;
    endsAt: string;
    gateRule: { id: string; type: string; reward: string } | null;
    taskRules: Array<{ id: string; reward: string; type: string }>;
    enabled: boolean;
  };
  perHuntGateEarned: boolean | null;
  taskEvaluations: RuleEvalLite[];
  allTasksComplete: boolean;
  isWithinWindow: boolean;
  canEnter: boolean;
  hasEntered: boolean;
}

interface ApiResponse {
  globalGate: { rule: { id: string; reward: string; type: string }; earned: boolean } | null;
  hunts: HuntProgressDto[];
}

export default function TreasureHuntDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next 16 hands params via Promise — `use()` unwraps for client comps.
  const { id } = use(params);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  // Local optimistic state for the entry submission.
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const refresh = async () => {
    const sess = await fetch("/api/session", { cache: "no-store" });
    const { address } = (await sess.json().catch(() => ({}))) as {
      address: string | null;
    };
    setSignedIn(!!address);
    if (!address) return;
    const res = await fetch("/api/treasure-hunts", { cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? `HTTP ${res.status}`);
      return;
    }
    setData((await res.json()) as ApiResponse);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hp = data?.hunts.find((h) => h.hunt.id === id) ?? null;
  const globalGateLocked = data?.globalGate
    ? !data.globalGate.earned
    : false;

  const handleEnter = async () => {
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const res = await fetch(
        `/api/treasure-hunts/${encodeURIComponent(id)}/enter`,
        { method: "POST" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        alreadyEntered?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setSubmitMsg(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setSubmitMsg(
        body.alreadyEntered
          ? "You were already entered. Good luck!"
          : "Entry recorded! May the draw favor you.",
      );
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0b1326] text-amber-50">
      <SiteHeader subtitle="Treasure Hunt" />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <Link
            href="/treasure-hunt"
            className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.18em] text-amber-300/70 hover:text-amber-200"
          >
            <ArrowLeft className="h-3 w-3" /> Back to map
          </Link>
        </div>

        {signedIn === null ? (
          <div className="text-sm text-amber-200/70">Loading…</div>
        ) : !signedIn ? (
          <div className="rounded-md border border-amber-500/30 bg-[#0d1830] p-6 text-center text-sm text-amber-200/80">
            Sign in from the dashboard to view this hunt.
            <div className="mt-3">
              <Button
                asChild
                className="bg-amber-500 text-amber-950 hover:bg-amber-400"
              >
                <Link href="/dashboard">Open dashboard</Link>
              </Button>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-md border border-red-500/40 bg-red-950/30 p-6 text-sm text-red-200">
            {error}
          </div>
        ) : globalGateLocked ? (
          <div className="rounded-md border border-amber-500/40 bg-[#0a1224] p-6 text-center text-sm text-amber-200">
            <Lock className="mx-auto mb-3 h-8 w-8 text-amber-400" />
            The vault is sealed. Return to the{" "}
            <Link href="/treasure-hunt" className="underline">
              Treasure Hunt page
            </Link>{" "}
            to see the requirement.
          </div>
        ) : !hp ? (
          <div className="rounded-md border border-amber-500/30 bg-[#0d1830] p-6 text-center text-sm text-amber-200/70">
            That hunt is no longer active or doesn&apos;t exist.
          </div>
        ) : (
          <Detail hp={hp} onEnter={handleEnter} submitting={submitting} submitMsg={submitMsg} />
        )}
      </main>
    </div>
  );
}

function Detail({
  hp,
  onEnter,
  submitting,
  submitMsg,
}: {
  hp: HuntProgressDto;
  onEnter: () => void;
  submitting: boolean;
  submitMsg: string | null;
}) {
  const tasksDone = hp.taskEvaluations.filter((e) => e.earned).length;
  const tasksTotal = hp.taskEvaluations.length;
  const isUpcoming = Date.now() < Date.parse(hp.hunt.startsAt);
  const isEnded = Date.now() >= Date.parse(hp.hunt.endsAt);

  return (
    <>
      {/* Hero */}
      <div className="relative overflow-hidden rounded-lg border-2 border-amber-500/40 bg-[radial-gradient(ellipse_at_top,#1a2440,#08101e)] p-6 shadow-[0_30px_80px_-30px_rgba(245,158,11,0.35)]">
        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_top_right,rgba(245,158,11,0.18),transparent_55%)]" />

        <div className="relative flex flex-col items-start gap-5 md:flex-row md:items-center">
          {hp.hunt.prizeImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hp.hunt.prizeImageUrl}
              alt={hp.hunt.prizeTitle}
              className="h-32 w-32 shrink-0 rounded-lg border-2 border-amber-400/40 object-cover shadow-[0_8px_30px_-8px_rgba(245,158,11,0.5)]"
            />
          ) : (
            <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-lg border-2 border-amber-400/40 bg-amber-500/10">
              <Trophy className="h-14 w-14 text-amber-400" />
            </div>
          )}
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-300/80">
              <Sparkles className="mr-1 inline h-3 w-3" /> The Prize
            </p>
            <h1 className="mt-1 font-serif text-3xl font-bold text-amber-100 md:text-4xl">
              {hp.hunt.title}
            </h1>
            <p className="mt-1 text-amber-200">
              <span className="text-amber-300">{hp.hunt.prizeTitle}</span>
              {hp.hunt.prizeDescription
                ? ` — ${hp.hunt.prizeDescription}`
                : ""}
            </p>
            {hp.hunt.description ? (
              <p className="mt-3 text-sm text-amber-200/70">
                {hp.hunt.description}
              </p>
            ) : null}
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs">
              <span className="text-amber-300">
                {isUpcoming ? "Starts in" : isEnded ? "Ended" : "Ends in"}
              </span>
              {!isEnded ? (
                <Countdown
                  to={isUpcoming ? hp.hunt.startsAt : hp.hunt.endsAt}
                  className="font-mono text-amber-100"
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Per-hunt gate notice */}
      {hp.perHuntGateEarned === false ? (
        <div className="rounded-md border border-rose-500/40 bg-rose-950/20 p-4 text-sm text-rose-200">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            <span className="font-semibold uppercase tracking-wider text-[11px]">
              Hunt gate not yet met
            </span>
          </div>
          <p className="mt-1 text-rose-100/80 text-sm">
            This hunt has an additional access requirement beyond the
            global vault. Once you satisfy it, the chests below begin to
            count toward entry.
          </p>
        </div>
      ) : null}

      {/* Tasks — chest rows */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl text-amber-100">Quests</h2>
          <span className="text-xs text-amber-300/80">
            {tasksDone}/{tasksTotal} complete
          </span>
        </div>
        {hp.taskEvaluations.map((e, i) => (
          <ChestRow key={e.rule.id} index={i + 1} evalLite={e} />
        ))}
      </div>

      {/* Entry CTA */}
      <div className="relative overflow-hidden rounded-lg border-2 border-amber-500/40 bg-[radial-gradient(ellipse_at_bottom,#1a2440,#06101e)] p-6 text-center shadow-[0_20px_60px_-20px_rgba(245,158,11,0.5)]">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(45deg,transparent_0,transparent_24px,rgba(245,158,11,0.05)_24px,rgba(245,158,11,0.05)_48px)]" />

        {hp.hasEntered ? (
          <div className="relative">
            <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-emerald-300" />
            <p className="font-serif text-2xl text-emerald-200">
              You&apos;re entered!
            </p>
            <p className="mt-1 text-sm text-amber-200/80">
              Stay tuned. The winning entry will be drawn after the timer
              runs out.
            </p>
          </div>
        ) : isEnded ? (
          <div className="relative">
            <p className="font-serif text-2xl text-zinc-300">
              The hunt has ended
            </p>
            <p className="mt-1 text-sm text-amber-200/60">
              Watch for the next one.
            </p>
          </div>
        ) : isUpcoming ? (
          <div className="relative">
            <p className="font-serif text-2xl text-amber-200">
              The hunt has not yet begun
            </p>
            <p className="mt-1 text-sm text-amber-200/60">
              Sharpen your blade. Lock your loot. Return when the timer
              starts.
            </p>
          </div>
        ) : (
          <div className="relative">
            <p className="font-serif text-2xl text-amber-100">
              {hp.canEnter ? "Claim your spot in the drawing" : "Keep going"}
            </p>
            <p className="mt-1 text-sm text-amber-200/70">
              {hp.canEnter
                ? "Every quest complete. One click and you're in."
                : `${tasksTotal - tasksDone} quest${tasksTotal - tasksDone === 1 ? "" : "s"} still ahead.`}
            </p>
            <Button
              onClick={onEnter}
              disabled={!hp.canEnter || submitting}
              className="mt-4 bg-amber-500 px-6 py-5 text-base font-semibold text-amber-950 shadow-[0_8px_30px_-8px_rgba(245,158,11,0.7)] hover:bg-amber-400 disabled:bg-amber-500/30 disabled:text-amber-200/40 disabled:shadow-none"
            >
              {submitting ? "Sealing your entry…" : "Enter the drawing"}
            </Button>
            {submitMsg ? (
              <p className="mt-3 text-xs text-amber-200/80">{submitMsg}</p>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}

function ChestRow({
  index,
  evalLite,
}: {
  index: number;
  evalLite: RuleEvalLite;
}) {
  const earned = evalLite.earned;
  const pct = Math.min(100, Math.round((evalLite.progress ?? 0) * 100));

  return (
    <div
      className={
        "relative overflow-hidden rounded-lg border p-4 transition " +
        (earned
          ? "border-amber-400/70 bg-gradient-to-br from-[#1c2545] to-[#0c1530] shadow-[0_8px_30px_-10px_rgba(245,158,11,0.5)]"
          : "border-amber-500/15 bg-[#0c1428]")
      }
    >
      {earned ? (
        <div className="pointer-events-none absolute -top-1/2 -right-1/4 h-full w-1/2 rounded-full bg-amber-400/20 blur-3xl animate-pulse" />
      ) : null}

      <div className="relative flex items-start gap-4">
        {/* Chest icon */}
        <div
          className={
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-md border transition " +
            (earned
              ? "border-amber-300/70 bg-amber-400/15 text-amber-200 shadow-[inset_0_0_20px_rgba(245,158,11,0.25)]"
              : "border-amber-500/25 bg-amber-500/5 text-amber-300/50")
          }
        >
          {earned ? (
            <Sparkles className="h-7 w-7 animate-pulse" />
          ) : (
            <Lock className="h-6 w-6" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300/60">
              Quest {index}
            </span>
            {earned ? (
              <span className="rounded-full border border-emerald-400/50 bg-emerald-400/10 px-2 py-[1px] text-[10px] uppercase tracking-wider text-emerald-200">
                Looted
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm font-semibold text-amber-100">
            {evalLite.rule.reward}
          </p>
          <p className="mt-1 text-xs text-amber-200/60">{evalLite.detail}</p>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-950/60">
            <div
              className={
                "h-full rounded-full transition-all " +
                (earned
                  ? "bg-gradient-to-r from-amber-300 to-amber-100"
                  : "bg-amber-500/40")
              }
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
