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
import type { RuleEvaluation } from "@/lib/verify";

interface Props {
  evaluations: RuleEvaluation[];
  earnedRewards: string[];
}

interface ClaimRow {
  rule_id: string;
  topshot_username: string;
  status: "pending" | "sent" | "rejected";
  updated_at: string;
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

function prizeIds(e: RuleEvaluation): { setId: number; playId: number } | null {
  const r = e.rule as unknown as { rewardSetId?: number; rewardPlayId?: number };
  if (r.rewardSetId == null || r.rewardPlayId == null) return null;
  return { setId: r.rewardSetId, playId: r.rewardPlayId };
}

/**
 * Small thumbnail loader. Hits our cached `/api/moment-image` lookup which
 * re-uses any Top Shot CDN URL already stored in `owned_moments` for the
 * same (setId, playId). Renders nothing until a URL comes back so we don't
 * flash a broken image.
 */
function PrizeThumbnail({ setId, playId }: { setId: number; playId: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/moment-image?setId=${setId}&playId=${playId}`,
          { cache: "force-cache" },
        );
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
  }, [setId, playId]);

  // Gold-ringed prize card. Placeholder shows a gradient tile so layout
  // doesn't jump while the thumbnail resolves.
  return (
    <div className="relative aspect-square w-28 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-amber-500/30 to-amber-700/10 ring-gold">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Prize Moment — set ${setId} play ${playId}`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-widest text-amber-200/80">
          Prize
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent" />
    </div>
  );
}

export function RewardsPanel({ evaluations, earnedRewards }: Props) {
  const [claims, setClaims] = useState<Record<string, ClaimRow>>({});

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-orange-400/90">
          Active challenges
        </span>
        <h2 className="text-2xl font-semibold tracking-tight">Rewards</h2>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300">
          <span className="font-mono text-sm font-semibold text-gold">
            {earnedRewards.length}
          </span>
          <span className="text-zinc-500">/ {evaluations.length} earned</span>
        </span>
      </div>

      {evaluations.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center">
          <p className="text-sm text-zinc-300">No rules configured</p>
          <p className="mt-1 text-xs text-zinc-500">
            Edit <span className="font-mono text-zinc-400">config/rewards.json</span>{" "}
            or use the admin panel to add reward rules.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {evaluations.map((e) => {
          const pct = Math.round(e.progress * 100);
          const ids = prizeIds(e);
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
                <div className="min-w-0">
                  <h3
                    className={
                      "truncate text-lg font-semibold tracking-tight " +
                      (e.earned ? "text-gold" : "text-zinc-100")
                    }
                  >
                    {e.rule.reward}
                  </h3>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {ruleSummary(e)}
                  </p>
                </div>
                {e.earned ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-200">
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
                ) : (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] font-semibold text-zinc-200">
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

              {prizeLine(e) ? (
                <div className="mt-1 flex items-start gap-3 rounded-xl border border-amber-400/15 bg-gradient-to-br from-amber-500/10 to-amber-950/10 p-3">
                  {ids ? (
                    <PrizeThumbnail setId={ids.setId} playId={ids.playId} />
                  ) : null}
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-amber-300/80">
                      Prize Moment
                    </span>
                    <p className="text-sm font-medium text-amber-100">
                      {prizeLine(e)}
                    </p>
                    {ids ? (
                      <p className="font-mono text-[10px] text-amber-200/60">
                        set {ids.setId} · play {ids.playId}
                      </p>
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
 * the user has already claimed, plus status.
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
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (existing?.topshot_username) setUsername(existing.topshot_username);
  }, [existing?.topshot_username]);

  const submit = async () => {
    setMsg(null);
    const u = username.trim();
    if (!/^[A-Za-z0-9_.-]{2,40}$/.test(u)) {
      setMsg({ kind: "err", text: "Enter a valid Top Shot username." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ruleId, topshotUsername: u }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg({ kind: "err", text: body.error ?? `HTTP ${res.status}` });
        return;
      }
      setMsg({ kind: "ok", text: "Submitted. The admin will airdrop soon." });
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
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={`ts-${ruleId}`}
          className="text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400"
        >
          Top Shot username to receive prize
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
        <Button
          size="sm"
          onClick={submit}
          disabled={busy || existing?.status === "sent"}
          className="h-9 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-4 text-[11px] font-semibold text-black hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "…" : existing ? "Update" : "Claim prize"}
        </Button>
      </div>
      {msg ? (
        <p
          className={
            "mt-1 text-[11px] " +
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
