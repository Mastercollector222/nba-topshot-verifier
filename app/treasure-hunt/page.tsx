"use client";

/**
 * /treasure-hunt
 * ---------------------------------------------------------------------------
 * Public landing page for the Treasure Hunt feature.
 *
 *   1. Pulls /api/session to know if the user is signed in.
 *   2. Pulls /api/treasure-hunts which returns globalGate status + per-user
 *      progress for every enabled hunt.
 *   3. Renders three states:
 *        - Not signed in → CTA to dashboard.
 *        - Global gate locked → parchment scroll showing the requirement.
 *        - Unlocked → grid of hunt cards (with countdown + task progress).
 *
 * Theme: dark navy + parchment + gold/amber accents. Hunt cards link
 * through to /treasure-hunt/[id] for the gamified task view.
 * ---------------------------------------------------------------------------
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Compass, Lock, MapPin, Sparkles, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { Countdown } from "@/components/Countdown";

interface RuleEvalLite {
  earned: boolean;
  progress: number;
  detail: string;
  rule: { id: string; reward: string; type: string };
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
    gateRule: unknown | null;
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

export default function TreasureHuntLandingPage() {
  const [address, setAddress] = useState<string | null | undefined>(undefined);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sess = await fetch("/api/session", { cache: "no-store" });
      const { address } = (await sess.json().catch(() => ({}))) as {
        address: string | null;
      };
      if (cancelled) return;
      setAddress(address ?? null);
      if (!address) return;

      const res = await fetch("/api/treasure-hunts", { cache: "no-store" });
      if (cancelled) return;
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setData((await res.json()) as ApiResponse);
    })().catch((e: unknown) => {
      if (!cancelled) {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#0b1326] text-amber-50">
      <SiteHeader subtitle="Treasure Hunt" />

      {/* Hero — parchment-glow over dark navy */}
      <section className="relative overflow-hidden border-b border-amber-500/20">
        {/* Decorative starfield */}
        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_top,rgba(245,158,11,0.18),transparent_60%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_50%)]" />
        {/* Map-dot texture */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(rgba(245,158,11,0.8)_1px,transparent_1px)] [background-size:22px_22px]" />
        {/* Slowly spinning compass watermark */}
        <Compass
          className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 text-amber-500/5 animate-[spin_60s_linear_infinite]"
          aria-hidden
        />

        <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center gap-4 px-6 py-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-300">
            <Sparkles className="h-3 w-3" /> Limited time · physical prize
          </div>
          <h1 className="font-serif text-5xl font-bold text-amber-100 [text-shadow:0_2px_24px_rgba(245,158,11,0.4)] md:text-6xl">
            Treasure Hunt
          </h1>
          <p className="max-w-xl text-sm text-amber-200/80">
            Complete the holder challenges. Win the prize. Each hunt is timed,
            each task is verified on-chain, and every winner is drawn from
            those who finish before the timer runs out.
          </p>
        </div>
      </section>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
        {address === undefined ? (
          <div className="rounded-md border border-amber-500/20 bg-[#0d1830] p-6 text-center text-sm text-amber-200/70">
            Loading…
          </div>
        ) : address === null ? (
          <NotSignedIn />
        ) : error ? (
          <div className="rounded-md border border-red-500/40 bg-red-950/30 p-6 text-sm text-red-200">
            {error}
          </div>
        ) : !data ? (
          <div className="rounded-md border border-amber-500/20 bg-[#0d1830] p-6 text-center text-sm text-amber-200/70">
            Reading the chart…
          </div>
        ) : (
          <Body data={data} />
        )}
      </main>
    </div>
  );
}

function NotSignedIn() {
  return (
    <div className="rounded-md border border-amber-500/30 bg-gradient-to-b from-[#10182d] to-[#0a1224] p-8 text-center">
      <Lock className="mx-auto mb-3 h-8 w-8 text-amber-400" />
      <h2 className="text-xl font-semibold text-amber-100">
        Sign in to begin
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-amber-200/70">
        Connect your wallet and verify your collection from the dashboard.
        Then the map appears.
      </p>
      <Button asChild className="mt-4 bg-amber-500 text-amber-950 hover:bg-amber-400">
        <Link href="/dashboard">Go to dashboard</Link>
      </Button>
    </div>
  );
}

function Body({ data }: { data: ApiResponse }) {
  const gateLocked = data.globalGate ? !data.globalGate.earned : false;

  if (gateLocked) {
    return <GateLocked rule={data.globalGate!.rule} />;
  }

  if (data.hunts.length === 0) {
    return (
      <div className="rounded-md border border-amber-500/20 bg-[#0d1830] p-8 text-center">
        <MapPin className="mx-auto mb-3 h-8 w-8 text-amber-400" />
        <h2 className="text-xl font-semibold text-amber-100">
          No active hunts
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-amber-200/70">
          The map is quiet for now. Check back soon — new hunts are posted
          regularly.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.hunts.map((hp) => (
        <HuntCard key={hp.hunt.id} hp={hp} />
      ))}
    </div>
  );
}

function GateLocked({
  rule,
}: {
  rule: { id: string; reward: string; type: string };
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border-2 border-amber-500/40 bg-[radial-gradient(ellipse_at_top,#1a2440,#08101e)] p-8 text-center shadow-[0_20px_50px_-20px_rgba(245,158,11,0.4)]">
      <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:repeating-linear-gradient(45deg,transparent_0,transparent_24px,rgba(245,158,11,0.04)_24px,rgba(245,158,11,0.04)_48px)]" />
      <Lock className="relative mx-auto mb-4 h-12 w-12 text-amber-400" />
      <h2 className="relative font-serif text-3xl font-bold text-amber-100">
        The Vault is Sealed
      </h2>
      <p className="relative mx-auto mt-2 max-w-lg text-sm text-amber-200/80">
        To enter the Treasure Hunt grounds, the keepers require a token of
        commitment. Once you meet the requirement below, this page unlocks
        for you automatically.
      </p>
      <div className="relative mx-auto mt-5 max-w-lg rounded-md border border-amber-500/30 bg-[#0a1224] p-4 text-left">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400">
          Requirement
        </p>
        <p className="mt-1 text-sm text-amber-100">
          <RuleSummary rule={rule} />
        </p>
      </div>
      <Button
        asChild
        className="relative mt-5 bg-amber-500 text-amber-950 hover:bg-amber-400"
      >
        <Link href="/dashboard">Open dashboard</Link>
      </Button>
    </div>
  );
}

function HuntCard({ hp }: { hp: HuntProgressDto }) {
  const tasksDone = hp.taskEvaluations.filter((e) => e.earned).length;
  const tasksTotal = hp.taskEvaluations.length;
  const pct = tasksTotal === 0 ? 0 : Math.round((tasksDone / tasksTotal) * 100);
  const status = hp.hasEntered
    ? "entered"
    : !hp.isWithinWindow
      ? Date.now() < Date.parse(hp.hunt.startsAt)
        ? "upcoming"
        : "ended"
      : hp.canEnter
        ? "ready"
        : "in-progress";

  const statusBadge = {
    entered: { text: "Entered", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
    ready: { text: "Ready to enter!", color: "bg-amber-400/30 text-amber-200 border-amber-400/60" },
    "in-progress": { text: "In progress", color: "bg-sky-500/15 text-sky-300 border-sky-500/40" },
    upcoming: { text: "Starts soon", color: "bg-zinc-700/30 text-zinc-300 border-zinc-600/40" },
    ended: { text: "Ended", color: "bg-zinc-800 text-zinc-500 border-zinc-700" },
  }[status];

  return (
    <Link
      href={`/treasure-hunt/${encodeURIComponent(hp.hunt.id)}`}
      className="group relative overflow-hidden rounded-lg border border-amber-500/20 bg-gradient-to-br from-[#0f1830] to-[#08101e] p-5 transition hover:border-amber-400/60 hover:shadow-[0_10px_40px_-10px_rgba(245,158,11,0.4)]"
    >
      {/* Decorative corner gleam */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-amber-400/10 opacity-70 transition group-hover:scale-125" />

      <div className="relative flex items-start gap-4">
        {hp.hunt.prizeImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hp.hunt.prizeImageUrl}
            alt={hp.hunt.prizeTitle}
            className="h-20 w-20 shrink-0 rounded-md border border-amber-400/30 object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-amber-400/30 bg-amber-500/10">
            <Trophy className="h-8 w-8 text-amber-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-serif text-xl font-semibold text-amber-100">
              {hp.hunt.title}
            </h3>
            <span
              className={`shrink-0 rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider ${statusBadge.color}`}
            >
              {statusBadge.text}
            </span>
          </div>
          <p className="mt-1 text-xs text-amber-300/80">
            Prize: <span className="font-medium">{hp.hunt.prizeTitle}</span>
          </p>
          {hp.hunt.description ? (
            <p className="mt-2 line-clamp-2 text-xs text-amber-200/60">
              {hp.hunt.description}
            </p>
          ) : null}
        </div>
      </div>

      {/* Progress + timer */}
      <div className="relative mt-5 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-amber-200/70">
          <span>
            {tasksDone}/{tasksTotal} tasks complete
          </span>
          <Countdown
            to={status === "upcoming" ? hp.hunt.startsAt : hp.hunt.endsAt}
            label={status === "upcoming" ? "Starts in" : "Ends in"}
          />
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-amber-950/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-200 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </Link>
  );
}

function RuleSummary({
  rule,
}: {
  rule: { id: string; reward: string; type: string } & Record<string, unknown>;
}) {
  // Best-effort human summary of any RewardRule shape. Keeps the page
  // honest without duplicating verifier logic.
  const r = rule as Record<string, unknown>;
  if (rule.type === "quantity") {
    const min = r.minCount as number | undefined;
    const playId = r.playId as number | undefined;
    const setId = r.setId as number | undefined;
    const locked = r.requireLocked === true;
    const parts: string[] = [];
    parts.push(`Own at least ${min ?? "?"} Moment${min === 1 ? "" : "s"}`);
    if (playId != null) parts.push(`of play ${playId}`);
    if (setId != null) parts.push(`from set ${setId}`);
    if (locked) parts.push("(all locked)");
    return <>{parts.join(" ")}</>;
  }
  if (rule.type === "set_completion") {
    const setId = r.setId as number | undefined;
    const min = (r.minPercent as number | undefined) ?? 100;
    return (
      <>
        Own {min}% of plays in set {setId ?? "?"}
        {r.requireLocked === true ? " (all locked)" : ""}
      </>
    );
  }
  if (rule.type === "specific_moments") {
    const ids = (r.momentIds as Array<unknown> | undefined) ?? [];
    return <>Own all {ids.length} listed Moment(s)</>;
  }
  return <>{rule.reward}</>;
}
