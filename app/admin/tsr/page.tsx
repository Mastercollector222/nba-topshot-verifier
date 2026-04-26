"use client";

/**
 * app/admin/tsr/page.tsx
 * ---------------------------------------------------------------------------
 * Admin-only screen for managing per-user TSR balances.
 *
 *   - Lists every user with TSR activity (challenges + adjustments) with
 *     a breakdown column.
 *   - Form at the top to record a new adjustment: address, signed integer
 *     points, optional reason. Append-only — to "undo", insert an opposite.
 *
 * Server-side gating is enforced by `/api/admin/tsr` (requireAdmin); this
 * page also checks `/api/admin/me` so non-admins see a 403 message
 * instead of a broken table.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/SiteHeader";

interface MeResponse {
  address: string | null;
  isAdmin: boolean;
}

interface TsrEntry {
  address: string;
  username: string | null;
  fromChallenges: number;
  fromAdjustments: number;
  total: number;
}

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export default function AdminTsrPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [entries, setEntries] = useState<TsrEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "info" | "error";
    text: string;
  } | null>(null);

  // Form state for new adjustments.
  const [formAddr, setFormAddr] = useState("");
  const [formPoints, setFormPoints] = useState("");
  const [formReason, setFormReason] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const meRes = await fetch("/api/admin/me", { cache: "no-store" });
      const meBody = (await meRes.json()) as MeResponse;
      setMe(meBody);
      if (meBody.isAdmin) {
        const tsrRes = await fetch("/api/admin/tsr", { cache: "no-store" });
        if (!tsrRes.ok) {
          throw new Error(`HTTP ${tsrRes.status}`);
        }
        const body = (await tsrRes.json()) as { entries: TsrEntry[] };
        setEntries(body.entries);
      }
    } catch (e) {
      setMessage({
        kind: "error",
        text: e instanceof Error ? e.message : "Failed to load TSR",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const points = Number(formPoints);
    if (!Number.isInteger(points) || points === 0) {
      setMessage({
        kind: "error",
        text: "Points must be a non-zero integer (positive grants, negative subtracts).",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/tsr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          flowAddress: formAddr.trim(),
          points,
          reason: formReason.trim() || undefined,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setMessage({
        kind: "info",
        text: `Recorded ${points > 0 ? "+" : ""}${points} TSR for ${formAddr}.`,
      });
      // Clear the form on success but keep the address — admins often
      // make multiple adjustments to the same user in a row.
      setFormPoints("");
      setFormReason("");
      await refresh();
    } catch (e) {
      setMessage({
        kind: "error",
        text: e instanceof Error ? e.message : "Adjustment failed",
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col font-sans text-foreground">
        <SiteHeader subtitle="Admin · TSR" />
        <main className="mx-auto max-w-5xl flex-1 px-6 py-12">
          <div className="glass flex items-center justify-center rounded-2xl p-16">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 rounded-full border-2 border-white/10" />
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-amber-400" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!me?.isAdmin) {
    return (
      <div className="flex min-h-screen flex-col font-sans text-foreground">
        <SiteHeader subtitle="Admin · TSR" />
        <main className="mx-auto max-w-3xl flex-1 px-6 py-16">
          <Card>
            <CardHeader>
              <CardTitle>Admin only</CardTitle>
              <CardDescription>
                Connect with an admin Flow address to manage TSR.
              </CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader subtitle="Admin · TSR" />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              TSR Adjustments
            </h1>
            <p className="text-sm text-zinc-400">
              Manually grant or revoke TSR points. Append-only audit log —
              insert an opposite-signed row to undo.
            </p>
          </div>
          <Link
            href="/admin"
            className="text-xs uppercase tracking-[0.18em] text-zinc-400 hover:text-orange-300"
          >
            ← Back to Rules
          </Link>
        </div>

        {/* New adjustment form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record adjustment</CardTitle>
            <CardDescription>
              Use a negative number to subtract. The user&apos;s balance
              updates the next time they (or anyone) loads a leaderboard
              page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={submitAdjustment}
              className="grid gap-3 md:grid-cols-[1fr_120px_2fr_auto] md:items-end"
            >
              <div>
                <Label htmlFor="adj-addr">Flow address</Label>
                <Input
                  id="adj-addr"
                  required
                  placeholder="0xabcdef0123456789"
                  value={formAddr}
                  onChange={(e) => setFormAddr(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div>
                <Label htmlFor="adj-points">Points</Label>
                <Input
                  id="adj-points"
                  required
                  type="number"
                  step={1}
                  placeholder="e.g. 50 or -10"
                  value={formPoints}
                  onChange={(e) => setFormPoints(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div>
                <Label htmlFor="adj-reason">Reason (optional)</Label>
                <Input
                  id="adj-reason"
                  placeholder="e.g. event prize, correction"
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  disabled={busy}
                />
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="h-10 rounded-full border-0 bg-gradient-to-r from-orange-500 to-red-500 px-5 text-sm font-semibold text-black shadow-[0_8px_24px_-8px_rgba(251,113,38,0.7)] hover:brightness-110"
              >
                {busy ? "Saving…" : "Record"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {message ? (
          <div
            className={
              "rounded-2xl border p-4 text-sm " +
              (message.kind === "error"
                ? "border-red-500/40 bg-red-500/10 text-red-300"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300")
            }
          >
            {message.text}
          </div>
        ) : null}

        {/* Balances table */}
        <div className="glass overflow-hidden rounded-2xl">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b border-white/5 px-5 py-3 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            <span>Collector</span>
            <span className="text-right">Challenges</span>
            <span className="text-right">Adjustments</span>
            <span className="text-right">Total</span>
          </div>
          {entries.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-zinc-400">
              No TSR activity yet.
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {entries.map((e) => (
                <li
                  key={e.address}
                  className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-3 transition hover:bg-white/[0.02]"
                >
                  <button
                    type="button"
                    onClick={() => setFormAddr(e.address)}
                    title={`Click to copy ${e.address} into the form`}
                    className="flex min-w-0 flex-col items-start gap-0.5 text-left"
                  >
                    {e.username ? (
                      <span className="truncate text-sm font-semibold text-zinc-100">
                        {e.username}
                      </span>
                    ) : null}
                    <span className="truncate font-mono text-[11px] text-zinc-500">
                      {shortAddr(e.address)}
                    </span>
                  </button>
                  <span className="text-right font-mono text-sm text-zinc-300">
                    {e.fromChallenges.toLocaleString()}
                  </span>
                  <span
                    className={
                      "text-right font-mono text-sm " +
                      (e.fromAdjustments > 0
                        ? "text-emerald-300"
                        : e.fromAdjustments < 0
                          ? "text-red-300"
                          : "text-zinc-500")
                    }
                  >
                    {e.fromAdjustments > 0 ? "+" : ""}
                    {e.fromAdjustments.toLocaleString()}
                  </span>
                  <span className="text-right font-mono text-base font-semibold text-gold">
                    {e.total.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
