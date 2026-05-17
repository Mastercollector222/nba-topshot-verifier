"use client";

/**
 * app/admin/stack-challenges/page.tsx
 * ---------------------------------------------------------------------------
 * Admin CRUD for "Test Your Stack" challenges.
 *  - List existing challenges (active / scheduled / past) with settle button.
 *  - Create form with a moment picker (player/set search → click to fill).
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
import { toast } from "@/components/Toaster";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Challenge {
  id: string;
  title: string;
  subtitle: string | null;
  setId: number;
  playId: number;
  playerName: string | null;
  setName: string | null;
  series: number | null;
  tier: string | null;
  thumbnailUrl: string | null;
  momentName: string | null;
  momentUrl: string | null;
  startsAt: string;
  endsAt: string;
  prizeRuleId: string | null;
  prizeTitle: string;
  prizeDescription: string | null;
  prizeImageUrl: string | null;
  accentColor: string | null;
  enabled: boolean;
  winnerAddress: string | null;
  winnerCount: number | null;
  settledAt: string | null;
  createdAt: string;
}

interface MomentSearchResult {
  setId: number;
  playId: number;
  setName: string | null;
  playerName: string | null;
  series: number | null;
  tier: string | null;
  thumbnailUrl: string | null;
  ownerCount: number;
}

interface RuleSummary {
  id: string;
  reward: string;
  is_physical: boolean;
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface FormState {
  id: string;
  title: string;
  subtitle: string;
  setId: string;
  playId: string;
  playerName: string;
  setName: string;
  series: string;
  tier: string;
  thumbnailUrl: string;
  momentName: string;
  momentUrl: string;
  startsAt: string;
  endsAt: string;
  prizeRuleId: string;
  prizeTitle: string;
  prizeDescription: string;
  prizeImageUrl: string;
  accentColor: string;
  enabled: boolean;
}

const EMPTY_FORM: FormState = {
  id: "",
  title: "",
  subtitle: "",
  setId: "",
  playId: "",
  playerName: "",
  setName: "",
  series: "",
  tier: "",
  thumbnailUrl: "",
  momentName: "",
  momentUrl: "",
  startsAt: "",
  endsAt: "",
  prizeRuleId: "",
  prizeTitle: "",
  prizeDescription: "",
  prizeImageUrl: "",
  accentColor: "",
  enabled: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtRange(starts: string, ends: string): string {
  const s = new Date(starts);
  const e = new Date(ends);
  return `${s.toLocaleString()} → ${e.toLocaleString()}`;
}

function status(ch: Challenge): { label: string; className: string } {
  if (ch.settledAt) return { label: "Settled",   className: "bg-zinc-500/15 text-zinc-300" };
  const now = Date.now();
  if (Date.parse(ch.startsAt) > now) return { label: "Scheduled", className: "bg-blue-500/15 text-blue-300" };
  if (Date.parse(ch.endsAt) <= now)  return { label: "Ended",     className: "bg-amber-500/15 text-amber-300" };
  return { label: "Live", className: "bg-emerald-500/15 text-emerald-300" };
}

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminStackChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [rules, setRules]           = useState<RuleSummary[]>([]);
  const [loading, setLoading]       = useState(true);
  const [form, setForm]             = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [busy, setBusy]             = useState(false);

  // Moment search
  const [momentQuery, setMomentQuery]   = useState("");
  const [momentResults, setMomentResults] = useState<MomentSearchResult[]>([]);
  const [searching, setSearching]         = useState(false);

  // Loaders
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [chRes, rulesRes] = await Promise.all([
        fetch("/api/admin/stack-challenges", { cache: "no-store" }),
        fetch("/api/admin/rules", { cache: "no-store" }),
      ]);
      if (chRes.ok) {
        const body = (await chRes.json()) as { challenges: Challenge[] };
        setChallenges(body.challenges);
      }
      if (rulesRes.ok) {
        const body = (await rulesRes.json()) as { rules: RuleSummary[] };
        setRules(body.rules);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Moment search (debounced)
  useEffect(() => {
    if (momentQuery.trim().length < 2) {
      setMomentResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/admin/stack-challenges/moment-search?q=${encodeURIComponent(momentQuery)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const body = (await res.json()) as { results: MomentSearchResult[] };
          setMomentResults(body.results);
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [momentQuery]);

  const pickMoment = (m: MomentSearchResult) => {
    setForm((f) => ({
      ...f,
      setId:        String(m.setId),
      playId:       String(m.playId),
      playerName:   m.playerName ?? "",
      setName:      m.setName ?? "",
      series:       m.series == null ? "" : String(m.series),
      tier:         m.tier ?? "",
      thumbnailUrl: m.thumbnailUrl ?? "",
    }));
    setMomentQuery("");
    setMomentResults([]);
    toast(`Picked ${m.playerName ?? m.setName ?? "moment"}`, "success");
  };

  const startEdit = (ch: Challenge) => {
    setEditingId(ch.id);
    setForm({
      id:               ch.id,
      title:            ch.title,
      subtitle:         ch.subtitle ?? "",
      setId:            String(ch.setId),
      playId:           String(ch.playId),
      playerName:       ch.playerName ?? "",
      setName:          ch.setName ?? "",
      series:           ch.series == null ? "" : String(ch.series),
      tier:             ch.tier ?? "",
      thumbnailUrl:     ch.thumbnailUrl ?? "",
      momentName:       ch.momentName ?? "",
      momentUrl:        ch.momentUrl ?? "",
      startsAt:         toLocalInput(ch.startsAt),
      endsAt:           toLocalInput(ch.endsAt),
      prizeRuleId:      ch.prizeRuleId ?? "",
      prizeTitle:       ch.prizeTitle,
      prizeDescription: ch.prizeDescription ?? "",
      prizeImageUrl:    ch.prizeImageUrl ?? "",
      accentColor:      ch.accentColor ?? "#f97316",
      enabled:          ch.enabled,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const submit = async () => {
    if (!form.id || !form.title || !form.setId || !form.playId || !form.startsAt || !form.endsAt || !form.prizeTitle) {
      toast("Fill required fields", "error");
      return;
    }
    setBusy(true);
    try {
      const body = {
        id:               form.id,
        title:            form.title,
        subtitle:         form.subtitle || null,
        setId:            Number(form.setId),
        playId:           Number(form.playId),
        playerName:       form.playerName || null,
        setName:          form.setName || null,
        series:           form.series ? Number(form.series) : null,
        tier:             form.tier || null,
        thumbnailUrl:     form.thumbnailUrl || null,
        momentName:       form.momentName || null,
        momentUrl:        form.momentUrl || null,
        startsAt:         new Date(form.startsAt).toISOString(),
        endsAt:           new Date(form.endsAt).toISOString(),
        prizeRuleId:      form.prizeRuleId || null,
        prizeTitle:       form.prizeTitle,
        prizeDescription: form.prizeDescription || null,
        prizeImageUrl:    form.prizeImageUrl || null,
        accentColor:      form.accentColor || null,
        enabled:          form.enabled,
      };
      const res = await fetch("/api/admin/stack-challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      toast(editingId ? "Updated" : "Created", "success");
      cancelEdit();
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(`Delete stack challenge "${id}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/stack-challenges/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Delete failed");
      }
      toast("Deleted", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const settle = async (id: string) => {
    if (!confirm("Settle now? This locks in the winner and credits the prize.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/stack-challenges/${encodeURIComponent(id)}/settle`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Settle failed");
      toast(
        j.winnerAddress
          ? `Winner: ${shortAddr(j.winnerAddress)} (${j.winnerCount})${j.prizeClaimCreated ? " — prize claim created" : ""}`
          : "No entrants",
        "success",
      );
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Settle failed", "error");
    } finally {
      setBusy(false);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Test Your Stack</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Pick a moment. Set a timer. Whoever holds the largest locked stack at the deadline wins.
        </p>
      </div>

      {/* ----------------- Form ----------------- */}
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? `Edit "${editingId}"` : "New challenge"}</CardTitle>
          <CardDescription>
            {editingId ? "Update an existing challenge." : "Search for a moment, set the window and prize, save."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Moment picker */}
          <div className="rounded-lg border border-orange-500/20 bg-orange-500/[0.04] p-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-orange-300">
              Moment picker
            </label>
            <input
              type="text"
              value={momentQuery}
              onChange={(e) => setMomentQuery(e.target.value)}
              placeholder="Search player or set name (e.g. LeBron, Base Set)…"
              className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-orange-400/50 focus:outline-none"
            />
            {searching && <p className="mt-2 text-xs text-zinc-500">Searching…</p>}
            {momentResults.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {momentResults.map((m) => (
                  <button
                    key={`${m.setId}-${m.playId}`}
                    type="button"
                    onClick={() => pickMoment(m)}
                    className="group flex items-center gap-2 rounded-md border border-white/5 bg-black/40 p-2 text-left transition hover:border-orange-400/40 hover:bg-orange-500/5"
                  >
                    {m.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.thumbnailUrl}
                        alt=""
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded bg-zinc-800" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-zinc-100">
                        {m.playerName ?? "Unknown"}
                      </p>
                      <p className="truncate text-[10px] text-zinc-500">
                        {m.setName ?? `Set ${m.setId}`}
                      </p>
                      <p className="text-[10px] text-zinc-600">{m.ownerCount} owners · S{m.series ?? "?"}/P{m.playId}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {form.setId && form.playId && (
              <p className="mt-3 text-xs text-emerald-400">
                ✓ Selected: <span className="font-mono">set {form.setId} / play {form.playId}</span>
                {form.playerName && ` — ${form.playerName}`}
              </p>
            )}
          </div>

          {/* Identity */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ID (slug)" required>
              <input
                type="text"
                disabled={!!editingId}
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase() })}
                placeholder="lebron-poster-aug-2026"
                className={inputCls}
              />
            </Field>
            <Field label="Title" required>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="LeBron Poster Showdown"
                className={inputCls}
              />
            </Field>
            <Field label="Subtitle">
              <input
                type="text"
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                placeholder="Stack the iconic poster — most locked wins"
                className={inputCls}
              />
            </Field>
            <Field label="Accent color (hex)">
              <input
                type="text"
                value={form.accentColor}
                onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                placeholder="#f97316"
                className={inputCls}
              />
            </Field>
          </div>

          {/* Moment details */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Moment name">
              <input
                type="text"
                value={form.momentName}
                onChange={(e) => setForm({ ...form, momentName: e.target.value })}
                placeholder="LeBron James Poster Dunk"
                className={inputCls}
              />
            </Field>
            <Field label="Moment URL">
              <input
                type="url"
                value={form.momentUrl}
                onChange={(e) => setForm({ ...form, momentUrl: e.target.value })}
                placeholder="https://nbatopshot.com/moment/..."
                className={inputCls}
              />
            </Field>
          </div>

          {/* Timing */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Starts at" required>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Ends at" required>
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>

          {/* Prize */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Prize: Reward Rule">
              <select
                value={form.prizeRuleId}
                onChange={(e) => setForm({ ...form, prizeRuleId: e.target.value })}
                className={inputCls}
              >
                <option value="">— None (manual fulfillment) —</option>
                {rules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} — {r.reward} {r.is_physical ? "📦" : "💾"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prize title" required>
              <input
                type="text"
                value={form.prizeTitle}
                onChange={(e) => setForm({ ...form, prizeTitle: e.target.value })}
                placeholder="Signed jersey + 1000 TSR"
                className={inputCls}
              />
            </Field>
            <Field label="Prize description">
              <textarea
                rows={2}
                value={form.prizeDescription}
                onChange={(e) => setForm({ ...form, prizeDescription: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Prize image URL">
              <input
                type="url"
                value={form.prizeImageUrl}
                onChange={(e) => setForm({ ...form, prizeImageUrl: e.target.value })}
                placeholder="https://…"
                className={inputCls}
              />
            </Field>
          </div>

          {/* Enabled toggle */}
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              className="h-4 w-4 rounded border-white/20 bg-black/40 text-orange-500"
            />
            Enabled (visible to users)
          </label>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={submit} disabled={busy}>
              {editingId ? "Update" : "Create"}
            </Button>
            {editingId && (
              <Button variant="ghost" onClick={cancelEdit} disabled={busy}>
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ----------------- List ----------------- */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          All challenges
        </h2>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-white/[0.04]" />
            ))}
          </div>
        ) : challenges.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-zinc-500">
              No challenges yet. Create one above.
            </CardContent>
          </Card>
        ) : (
          challenges.map((ch) => {
            const st = status(ch);
            return (
              <Card key={ch.id} className="overflow-hidden">
                <CardContent className="flex flex-wrap items-center gap-4 p-4">
                  {ch.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ch.thumbnailUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  ) : (
                    <div className="h-16 w-16 rounded-lg bg-zinc-800" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-zinc-100">{ch.title}</h3>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${st.className}`}>
                        {st.label}
                      </span>
                      {!ch.enabled && (
                        <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-[10px] text-zinc-400">
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {ch.playerName ?? "—"} · set {ch.setId} / play {ch.playId}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-600">{fmtRange(ch.startsAt, ch.endsAt)}</p>
                    {ch.winnerAddress && (
                      <p className="mt-1 text-xs text-emerald-400">
                        🏆 Winner: <span className="font-mono">{shortAddr(ch.winnerAddress)}</span> with {ch.winnerCount}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/test-your-stack#${ch.id}`}
                      className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
                    >
                      View
                    </Link>
                    {!ch.settledAt && (
                      <Button size="sm" variant="outline" onClick={() => settle(ch.id)} disabled={busy}>
                        Settle
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => startEdit(ch)} disabled={busy}>
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => remove(ch.id)} disabled={busy}>
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable form helpers
// ---------------------------------------------------------------------------

const inputCls =
  "w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-orange-400/50 focus:outline-none";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">
        {label} {required && <span className="text-orange-400">*</span>}
      </span>
      {children}
    </label>
  );
}
