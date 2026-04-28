"use client";

/**
 * components/RuleBuilderForm.tsx
 * ---------------------------------------------------------------------------
 * Structured form for authoring reward rules. Replaces the raw JSON textarea
 * in `/admin`, so non-engineers can compose rules safely.
 *
 * Supported rule types:
 *   - `quantity`         — "own at least N Moments matching X" (the "Own 5
 *                          of a specific Moment" case: set `minCount=5`,
 *                          `setId=<id>`, `playId=<id>`).
 *   - `specific_moments` — "own ALL of these exact Moment IDs".
 *   - `set_completion`   — "own ≥ X% of all plays in a given set".
 *
 * The form builds a well-typed object and hands it to an onSubmit callback.
 * Server re-validates via `validateSingleRule` regardless of what the form
 * produces, so this is UX polish, not a security layer.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RuleType = "quantity" | "specific_moments" | "set_completion";

export interface BuiltRule {
  id: string;
  type: RuleType;
  reward: string;
  // quantity
  minCount?: number;
  setId?: number;
  playId?: number;
  series?: number;
  tier?: string;
  // specific_moments
  momentIds?: string[];
  // set_completion
  totalPlays?: number;
  minPercent?: number;
  // Prize Moment (optional — shown to winners so they know what they won)
  rewardSetId?: number;
  rewardPlayId?: number;
  rewardDescription?: string;
  // Optional NBA Top Shot listing URLs. The admin pastes these so the
  // dashboard renders "View on Top Shot" buttons next to the challenge
  // and prize thumbnails. Both purely metadata.
  rewardMomentUrl?: string;
  challengeMomentUrl?: string;
  // TSR points awarded when a user first earns this rule. Optional;
  // defaults to 0 (no points). Stored on `lifetime_completions` at
  // earn time so future edits don't retroactively change standings.
  tsrPoints?: number;
  // Custom CDN URL for the required-Moment thumbnail (used by
  // set_completion rules where no single play image is representative).
  setImageUrl?: string;
  // Locking requirements (optional — applies to every rule type)
  requireLocked?: boolean;
  requireLockedUntil?: number;
}

interface Props {
  /** Optional initial rule (when editing). */
  initial?: Partial<BuiltRule> & { enabled?: boolean };
  onSubmit: (rule: BuiltRule, enabled: boolean) => void | Promise<void>;
  onCancel?: () => void;
  busy?: boolean;
}

function trimOrEmpty(v: string): string {
  return v.trim();
}

function parseOptionalInt(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Convert a UFix64-seconds timestamp into a `datetime-local` string. */
function isoFromUFix64(seconds: number): string {
  const d = new Date(seconds * 1000);
  if (Number.isNaN(d.getTime())) return "";
  // Format as local `YYYY-MM-DDTHH:mm` for the datetime-local input.
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** Convert a `datetime-local` string back into UFix64 seconds (or undefined). */
function uFix64FromIso(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return undefined;
  return Math.floor(ms / 1000);
}

export function RuleBuilderForm({ initial, onSubmit, onCancel, busy }: Props) {
  const [id, setId] = useState(initial?.id ?? "");
  const [reward, setReward] = useState(initial?.reward ?? "");
  const [type, setType] = useState<RuleType>((initial?.type as RuleType) ?? "quantity");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);

  // quantity
  const [minCount, setMinCount] = useState(
    initial?.minCount != null ? String(initial.minCount) : "1",
  );
  const [setId_, setSetId] = useState(
    initial?.setId != null ? String(initial.setId) : "",
  );
  const [playId, setPlayId] = useState(
    initial?.playId != null ? String(initial.playId) : "",
  );
  const [series, setSeries] = useState(
    initial?.series != null ? String(initial.series) : "",
  );
  const [tier, setTier] = useState(initial?.tier ?? "");

  // specific_moments
  const [momentIdsText, setMomentIdsText] = useState(
    initial?.momentIds ? initial.momentIds.join(", ") : "",
  );

  // set_completion
  const [totalPlays, setTotalPlays] = useState(
    initial?.totalPlays != null ? String(initial.totalPlays) : "",
  );
  const [minPercent, setMinPercent] = useState(
    initial?.minPercent != null ? String(initial.minPercent) : "100",
  );

  // Auto-resolved set info from /api/admin/set-info — populated when the
  // admin types a Set ID for a `set_completion` rule. Removes the manual
  // "how many plays does this set have?" data-entry step.
  const [setInfo, setSetInfo] = useState<{
    setId: number;
    setName: string | null;
    series: number | null;
    totalPlays: number;
  } | null>(null);
  const [setInfoStatus, setSetInfoStatus] = useState<
    "idle" | "loading" | "ok" | "not_found" | "error"
  >("idle");
  const [setInfoError, setSetInfoError] = useState<string | null>(null);

  // Prize Moment (all optional)
  const [rewardSetId, setRewardSetId] = useState(
    initial?.rewardSetId != null ? String(initial.rewardSetId) : "",
  );
  const [rewardPlayId, setRewardPlayId] = useState(
    initial?.rewardPlayId != null ? String(initial.rewardPlayId) : "",
  );
  const [rewardDescription, setRewardDescription] = useState(
    initial?.rewardDescription ?? "",
  );
  const [rewardMomentUrl, setRewardMomentUrl] = useState(
    initial?.rewardMomentUrl ?? "",
  );
  const [challengeMomentUrl, setChallengeMomentUrl] = useState(
    initial?.challengeMomentUrl ?? "",
  );
  const [tsrPoints, setTsrPoints] = useState(
    initial?.tsrPoints != null ? String(initial.tsrPoints) : "",
  );
  const [setImageUrl, setSetImageUrl] = useState(initial?.setImageUrl ?? "");

  // Locking gate
  const [requireLocked, setRequireLocked] = useState(
    initial?.requireLocked ?? false,
  );
  // Store the until-date as an ISO datetime-local string for the input; we
  // convert to/from UFix64 seconds at the rule-building boundary.
  const [requireLockedUntilStr, setRequireLockedUntilStr] = useState(
    initial?.requireLockedUntil != null
      ? isoFromUFix64(initial.requireLockedUntil)
      : "",
  );

  // Reload state when `initial` changes (e.g. user clicked a different Edit
  // button from the rule list above).
  useEffect(() => {
    if (!initial) return;
    setId(initial.id ?? "");
    setReward(initial.reward ?? "");
    if (initial.type) setType(initial.type as RuleType);
    setEnabled(initial.enabled ?? true);
    setMinCount(initial.minCount != null ? String(initial.minCount) : "1");
    setSetId(initial.setId != null ? String(initial.setId) : "");
    setPlayId(initial.playId != null ? String(initial.playId) : "");
    setSeries(initial.series != null ? String(initial.series) : "");
    setTier(initial.tier ?? "");
    setMomentIdsText(initial.momentIds ? initial.momentIds.join(", ") : "");
    setTotalPlays(initial.totalPlays != null ? String(initial.totalPlays) : "");
    setMinPercent(initial.minPercent != null ? String(initial.minPercent) : "100");
    setRewardSetId(initial.rewardSetId != null ? String(initial.rewardSetId) : "");
    setRewardPlayId(initial.rewardPlayId != null ? String(initial.rewardPlayId) : "");
    setRewardDescription(initial.rewardDescription ?? "");
    setRewardMomentUrl(initial.rewardMomentUrl ?? "");
    setChallengeMomentUrl(initial.challengeMomentUrl ?? "");
    setTsrPoints(initial.tsrPoints != null ? String(initial.tsrPoints) : "");
    setSetImageUrl(initial.setImageUrl ?? "");
    setRequireLocked(initial.requireLocked ?? false);
    setRequireLockedUntilStr(
      initial.requireLockedUntil != null
        ? isoFromUFix64(initial.requireLockedUntil)
        : "",
    );
  }, [initial]);

  // Auto-fetch on-chain set metadata while the admin types a Set ID for
  // a `set_completion` rule. Debounced so we don't hammer the RPC on
  // every keystroke. The response auto-fills `totalPlays` so the admin
  // never has to know that number.
  useEffect(() => {
    if (type !== "set_completion") {
      setSetInfo(null);
      setSetInfoStatus("idle");
      setSetInfoError(null);
      return;
    }
    const trimmed = setId_.trim();
    if (!trimmed || !/^[0-9]+$/.test(trimmed)) {
      setSetInfo(null);
      setSetInfoStatus("idle");
      setSetInfoError(null);
      return;
    }
    let cancelled = false;
    setSetInfoStatus("loading");
    setSetInfoError(null);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/set-info?setId=${encodeURIComponent(trimmed)}`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        if (res.status === 404) {
          setSetInfo(null);
          setSetInfoStatus("not_found");
          setSetInfoError(null);
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setSetInfo(null);
          setSetInfoStatus("error");
          setSetInfoError(body.error ?? `HTTP ${res.status}`);
          return;
        }
        const data = (await res.json()) as {
          setId: number;
          setName: string | null;
          series: number | null;
          totalPlays: number;
        };
        if (cancelled) return;
        setSetInfo(data);
        setSetInfoStatus("ok");
        setSetInfoError(null);
        // Auto-populate the totalPlays field. The admin can still
        // override manually (e.g. for partial-set challenges based on
        // a subset of plays), but the default reflects on-chain truth.
        setTotalPlays(String(data.totalPlays));
      } catch (e) {
        if (cancelled) return;
        setSetInfo(null);
        setSetInfoStatus("error");
        setSetInfoError(e instanceof Error ? e.message : "Network error");
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [type, setId_]);

  const rule = useMemo<BuiltRule | null>(() => {
    const idTrim = trimOrEmpty(id);
    const rewardTrim = trimOrEmpty(reward);
    if (!idTrim || !rewardTrim) return null;

    const prize = {
      rewardSetId: parseOptionalInt(rewardSetId),
      rewardPlayId: parseOptionalInt(rewardPlayId),
      rewardDescription: trimOrEmpty(rewardDescription) || undefined,
      rewardMomentUrl: trimOrEmpty(rewardMomentUrl) || undefined,
      challengeMomentUrl: trimOrEmpty(challengeMomentUrl) || undefined,
      tsrPoints: parseOptionalInt(tsrPoints),
      setImageUrl: trimOrEmpty(setImageUrl) || undefined,
    };
    const lockingUntil = uFix64FromIso(requireLockedUntilStr);
    // If a deadline is set we implicitly require locked. Keep the stored
    // flag truthful so the server-side rules engine sees a consistent view.
    const effectiveRequireLocked =
      requireLocked || lockingUntil !== undefined;
    const locking = {
      requireLocked: effectiveRequireLocked || undefined,
      requireLockedUntil: lockingUntil,
    };
    const base = { id: idTrim, reward: rewardTrim, ...prize, ...locking };
    switch (type) {
      case "quantity": {
        const n = parseOptionalInt(minCount);
        if (!n || n <= 0) return null;
        return {
          ...base,
          type: "quantity",
          minCount: n,
          setId: parseOptionalInt(setId_),
          playId: parseOptionalInt(playId),
          series: parseOptionalInt(series),
          tier: trimOrEmpty(tier) || undefined,
        };
      }
      case "specific_moments": {
        const ids = momentIdsText
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (ids.length === 0) return null;
        return { ...base, type: "specific_moments", momentIds: ids };
      }
      case "set_completion": {
        const tp = parseOptionalInt(totalPlays);
        const pct = parseOptionalInt(minPercent) ?? 100;
        const sid = parseOptionalInt(setId_);
        if (!tp || tp <= 0 || sid == null) return null;
        if (pct <= 0 || pct > 100) return null;
        return {
          ...base,
          type: "set_completion",
          setId: sid,
          totalPlays: tp,
          minPercent: pct,
        };
      }
    }
  }, [
    id,
    reward,
    type,
    minCount,
    setId_,
    playId,
    series,
    tier,
    momentIdsText,
    totalPlays,
    minPercent,
    rewardSetId,
    rewardPlayId,
    rewardDescription,
    rewardMomentUrl,
    challengeMomentUrl,
    tsrPoints,
    setImageUrl,
    requireLocked,
    requireLockedUntilStr,
  ]);

  const handleSubmit = async () => {
    setError(null);
    if (!rule) {
      setError("Please fill in all required fields for this rule type.");
      return;
    }
    await onSubmit(rule, enabled);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor="rule-id">Rule ID</Label>
          <Input
            id="rule-id"
            placeholder="e.g. five-of-lebron-dunk"
            value={id}
            onChange={(e) => setId(e.target.value)}
            disabled={busy}
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            Stable identifier. Reusing an existing id overwrites that rule.
          </p>
        </div>
        <div>
          <Label htmlFor="rule-reward">Reward label</Label>
          <Input
            id="rule-reward"
            placeholder="e.g. Lebron Legendary Collector"
            value={reward}
            onChange={(e) => setReward(e.target.value)}
            disabled={busy}
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            Shown to the user when earned.
          </p>
        </div>
      </div>

      <div>
        <Label htmlFor="rule-type">Rule type</Label>
        <Select
          value={type}
          onValueChange={(v) => setType(v as RuleType)}
          disabled={busy}
        >
          <SelectTrigger id="rule-type" className="w-full md:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="quantity">
              Quantity — own at least N Moments matching filters
            </SelectItem>
            <SelectItem value="specific_moments">
              Specific Moments — own ALL of these exact Moment IDs
            </SelectItem>
            <SelectItem value="set_completion">
              Set completion — own ≥ X% of plays in a set
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ------------------ type-specific sections ------------------ */}

      {type === "quantity" ? (
        <div className="grid gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800 md:grid-cols-2">
          <div>
            <Label htmlFor="q-min">Minimum count *</Label>
            <Input
              id="q-min"
              type="number"
              min={1}
              value={minCount}
              onChange={(e) => setMinCount(e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <Label htmlFor="q-tier">Tier filter (optional)</Label>
            <Select
              value={tier || "any"}
              onValueChange={(v) => setTier(v === "any" ? "" : v)}
              disabled={busy}
            >
              <SelectTrigger id="q-tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any tier</SelectItem>
                <SelectItem value="COMMON">COMMON</SelectItem>
                <SelectItem value="RARE">RARE</SelectItem>
                <SelectItem value="LEGENDARY">LEGENDARY</SelectItem>
                <SelectItem value="ULTIMATE">ULTIMATE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="q-set">Set ID (optional)</Label>
            <Input
              id="q-set"
              type="number"
              placeholder="e.g. 39"
              value={setId_}
              onChange={(e) => setSetId(e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <Label htmlFor="q-play">Play ID (optional)</Label>
            <Input
              id="q-play"
              type="number"
              placeholder="e.g. 3957"
              value={playId}
              onChange={(e) => setPlayId(e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <Label htmlFor="q-series">Series (optional)</Label>
            <Input
              id="q-series"
              type="number"
              placeholder="e.g. 2"
              value={series}
              onChange={(e) => setSeries(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="md:col-span-2">
            <p className="text-[11px] text-zinc-500">
              Combine filters to narrow the match. Example: <strong>minCount
              = 5</strong>, <strong>setId = 39</strong>, <strong>playId =
              3957</strong> means &quot;own at least 5 serials of play 3957
              from set 39.&quot; Leave filters blank to match any Moment.
            </p>
          </div>
        </div>
      ) : null}

      {type === "specific_moments" ? (
        <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
          <Label htmlFor="sm-ids">Moment IDs *</Label>
          <textarea
            id="sm-ids"
            value={momentIdsText}
            onChange={(e) => setMomentIdsText(e.target.value)}
            rows={4}
            placeholder="51296841, 51296842, 51296843"
            disabled={busy}
            className="w-full rounded-md border border-zinc-200 bg-white p-2 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-950"
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            Serial-level Moment NFT ids (the big UInt64s). Comma- or
            whitespace-separated. User must own every id listed.
          </p>
        </div>
      ) : null}

      {type === "set_completion" ? (
        <div className="grid gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800 md:grid-cols-3">
          <div>
            <Label htmlFor="sc-set">Set ID *</Label>
            <Input
              id="sc-set"
              type="number"
              value={setId_}
              onChange={(e) => setSetId(e.target.value)}
              disabled={busy}
              placeholder="e.g. 39"
            />
          </div>
          <div>
            <Label htmlFor="sc-total">Total plays in set</Label>
            <Input
              id="sc-total"
              type="number"
              min={1}
              value={totalPlays}
              onChange={(e) => setTotalPlays(e.target.value)}
              disabled={busy}
              placeholder="auto from chain"
            />
            <p className="mt-1 text-[10px] text-zinc-500">
              Auto-filled when the Set ID resolves on chain. Override only
              if defining a partial-set challenge.
            </p>
          </div>
          <div>
            <Label htmlFor="sc-pct">Min percent</Label>
            <Input
              id="sc-pct"
              type="number"
              min={1}
              max={100}
              value={minPercent}
              onChange={(e) => setMinPercent(e.target.value)}
              disabled={busy}
            />
            <p className="mt-1 text-[10px] text-zinc-500">
              100 = own every play in the set.
            </p>
          </div>

          <div className="md:col-span-3">
            <Label htmlFor="sc-image">Set artwork URL (optional)</Label>
            <Input
              id="sc-image"
              type="url"
              placeholder="https://assets.nbatopshot.com/..."
              value={setImageUrl}
              onChange={(e) => setSetImageUrl(e.target.value)}
              disabled={busy}
            />
            <p className="mt-1 text-[10px] text-zinc-500">
              Shown as the “required Moment” tile on the dashboard +
              treasure-hunt chest. If blank, we fall back to a
              representative play thumbnail from the set.
            </p>
          </div>

          {/* On-chain preview banner — confirms which set the admin
              actually picked and removes the manual play-count step. */}
          <div className="md:col-span-3">
            {setInfoStatus === "loading" ? (
              <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
                Looking up set on chain…
              </p>
            ) : setInfoStatus === "ok" && setInfo ? (
              <p className="rounded-md border border-emerald-500/40 bg-emerald-50/50 px-3 py-2 text-[11px] text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-950/20 dark:text-emerald-200">
                <strong>{setInfo.setName ?? `Set ${setInfo.setId}`}</strong>
                {setInfo.series != null ? ` · Series ${setInfo.series}` : ""}
                {" — "}
                {setInfo.totalPlays} plays.{" "}
                {Number(minPercent) === 100
                  ? "Earned by owning every play."
                  : `Earned at ${minPercent}% of plays (≈ ${Math.ceil(
                      (Number(minPercent) / 100) * setInfo.totalPlays,
                    )} plays).`}
              </p>
            ) : setInfoStatus === "not_found" ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-50/50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/20 dark:text-amber-200">
                Set ID not found on chain. Double-check the number.
              </p>
            ) : setInfoStatus === "error" ? (
              <p className="rounded-md border border-rose-500/40 bg-rose-50/50 px-3 py-2 text-[11px] text-rose-900 dark:border-rose-400/30 dark:bg-rose-950/20 dark:text-rose-200">
                Couldn’t look up set: {setInfoError}
              </p>
            ) : (
              <p className="text-[11px] text-zinc-500">
                Type a Set ID to auto-fill play count from chain.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {/* ------------------ locking gate (optional) ------------------ */}

      <div className="grid gap-3 rounded-md border border-sky-500/40 bg-sky-50/30 p-4 dark:border-sky-400/30 dark:bg-sky-950/20 md:grid-cols-2">
        <div className="md:col-span-2">
          <p className="text-sm font-medium">Locking requirement (optional)</p>
          <p className="text-[11px] text-zinc-500">
            Require that each qualifying Moment is currently locked via
            TopShotLocking. Useful for holder-challenge rewards where you
            want winners to commit by locking their Moments.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={requireLocked}
            onChange={(e) => setRequireLocked(e.target.checked)}
            disabled={busy}
          />
          Require Moments to be locked
        </label>
        <div>
          <Label htmlFor="lock-until">Locked through (optional)</Label>
          <Input
            id="lock-until"
            type="datetime-local"
            value={requireLockedUntilStr}
            onChange={(e) => setRequireLockedUntilStr(e.target.value)}
            disabled={busy}
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            If set, each Moment&apos;s lock must last at least this long.
            Sets Require Locked implicitly.
          </p>
        </div>
      </div>

      {/* ------------------ prize Moment (optional) ------------------ */}

      <div className="grid gap-3 rounded-md border border-amber-500/40 bg-amber-50/30 p-4 dark:border-amber-400/30 dark:bg-amber-950/20 md:grid-cols-3">
        <div className="md:col-span-3">
          <p className="text-sm font-medium">Prize Moment (optional)</p>
          <p className="text-[11px] text-zinc-500">
            Describe the NBA Top Shot Moment you&apos;ll airdrop to winners.
            Shown on the dashboard so winners know what they earned and can
            submit their Top Shot username for delivery.
          </p>
        </div>
        <div>
          <Label htmlFor="prize-set">Set ID</Label>
          <Input
            id="prize-set"
            type="number"
            placeholder="e.g. 114"
            value={rewardSetId}
            onChange={(e) => setRewardSetId(e.target.value)}
            disabled={busy}
          />
        </div>
        <div>
          <Label htmlFor="prize-play">Play ID</Label>
          <Input
            id="prize-play"
            type="number"
            placeholder="e.g. 5421"
            value={rewardPlayId}
            onChange={(e) => setRewardPlayId(e.target.value)}
            disabled={busy}
          />
        </div>
        <div>
          <Label htmlFor="prize-desc">Description</Label>
          <Input
            id="prize-desc"
            placeholder="e.g. LeBron Dunk — Rare"
            value={rewardDescription}
            onChange={(e) => setRewardDescription(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="md:col-span-3">
          <Label htmlFor="prize-url">Prize Moment link (NBA Top Shot URL)</Label>
          <Input
            id="prize-url"
            type="url"
            placeholder="https://nbatopshot.com/listings/p2p/..."
            value={rewardMomentUrl}
            onChange={(e) => setRewardMomentUrl(e.target.value)}
            disabled={busy}
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            Optional. Adds a &quot;View on Top Shot&quot; button next to the
            prize thumbnail on the dashboard.
          </p>
        </div>
        <div className="md:col-span-3">
          <Label htmlFor="challenge-url">
            Required Moment link (NBA Top Shot URL)
          </Label>
          <Input
            id="challenge-url"
            type="url"
            placeholder="https://nbatopshot.com/listings/p2p/..."
            value={challengeMomentUrl}
            onChange={(e) => setChallengeMomentUrl(e.target.value)}
            disabled={busy}
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            Optional. Adds a &quot;View on Top Shot&quot; button so users can
            click straight through to buy/lock the Moment they need.
          </p>
        </div>
        <div className="md:col-span-3">
          <Label htmlFor="tsr-points">
            <span className="text-amber-300">TSR points awarded</span> on
            completion
          </Label>
          <Input
            id="tsr-points"
            type="number"
            min={0}
            step={1}
            placeholder="e.g. 100"
            value={tsrPoints}
            onChange={(e) => setTsrPoints(e.target.value)}
            disabled={busy}
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            Non-negative integer. Awarded once per user the first time
            they earn this rule. Snapshot at earn-time — editing this
            later won&apos;t change anyone&apos;s existing TSR balance.
          </p>
        </div>
      </div>

      {/* ------------------ footer ------------------ */}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={busy}
          />
          Enabled (used by <span className="font-mono">/api/verify</span>)
        </label>
        <div className="ml-auto flex items-center gap-2">
          {onCancel ? (
            <Button variant="outline" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          ) : null}
          <Button onClick={handleSubmit} disabled={busy || !rule}>
            {busy ? "Saving…" : "Save rule"}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-xs text-red-500" role="alert">
          {error}
        </p>
      ) : null}

      <details className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <summary className="cursor-pointer text-xs text-zinc-500">
          Preview JSON (what will be sent to the server)
        </summary>
        <pre className="mt-2 overflow-x-auto rounded bg-zinc-50 p-2 font-mono text-[11px] dark:bg-zinc-900">
          {rule ? JSON.stringify(rule, null, 2) : "// Fill in required fields…"}
        </pre>
      </details>
    </div>
  );
}

export default RuleBuilderForm;
