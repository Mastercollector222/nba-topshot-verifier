"use client";

/**
 * app/admin/forge/page.tsx
 * ---------------------------------------------------------------------------
 * Admin console for The Forge.
 *   - Build / edit / delete crafting recipes (required input moments → reward).
 *   - Review submissions and fulfill the reward airdrop.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/Toaster";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InputGroup {
  label: string | null;
  setId: number | null;
  playId: number | null;
  series: number | null;
  tier: string | null;
  count: number;
}

interface Recipe {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  inputs: InputGroup[];
  inputImageUrl: string | null;
  inputMomentUrl: string | null;
  rewardTitle: string;
  rewardDescription: string | null;
  rewardSetId: number | null;
  rewardPlayId: number | null;
  rewardImageUrl: string | null;
  rewardMomentUrl: string | null;
  maxPerUser: number;
  maxTotal: number | null;
  startsAt: string | null;
  endsAt: string | null;
  accentColor: string | null;
  enabled: boolean;
  requireSoldOrigin: boolean;
  stats?: Record<string, number>;
}

interface Submission {
  id: string;
  recipeId: string;
  flowAddress: string;
  topshotUsername: string | null;
  committedMomentIds: string[];
  status: string;
  burnVerifiedAt: string | null;
  rewardSentAt: string | null;
  adminNote: string | null;
  rewardTxId: string | null;
  createdAt: string;
  recipe: Recipe | null;
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

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface FormState {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  inputs: InputGroup[];
  inputImageUrl: string;
  inputMomentUrl: string;
  rewardTitle: string;
  rewardDescription: string;
  rewardSetId: string;
  rewardPlayId: string;
  rewardImageUrl: string;
  rewardMomentUrl: string;
  maxPerUser: string;
  maxTotal: string;
  startsAt: string;
  endsAt: string;
  accentColor: string;
  enabled: boolean;
  requireSoldOrigin: boolean;
}

const EMPTY_GROUP: InputGroup = {
  label: null, setId: null, playId: null, series: null, tier: null, count: 1,
};

const EMPTY_FORM: FormState = {
  id: "", title: "", subtitle: "", description: "",
  inputs: [{ ...EMPTY_GROUP }],
  inputImageUrl: "", inputMomentUrl: "",
  rewardTitle: "", rewardDescription: "", rewardSetId: "", rewardPlayId: "",
  rewardImageUrl: "", rewardMomentUrl: "",
  maxPerUser: "1", maxTotal: "",
  startsAt: "", endsAt: "", accentColor: "#f97316", enabled: true,
  requireSoldOrigin: false,
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

const STATUS_TABS = [
  { key: "burn_verified", label: "Ready to airdrop" },
  { key: "reward_sent", label: "Sent" },
  { key: "pending_burn", label: "Awaiting burn" },
  { key: "rejected", label: "Rejected" },
  { key: "cancelled", label: "Cancelled" },
  { key: "", label: "All" },
] as const;

function shortAddr(a: string) {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const TOP_TABS = [
  { key: "recipes", label: "Recipes" },
  { key: "submissions", label: "Submissions" },
  { key: "sold", label: "Sold list" },
] as const;

type TopTab = (typeof TOP_TABS)[number]["key"];

export default function AdminForgePage() {
  const [tab, setTab] = useState<TopTab>("recipes");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">The Forge</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Create crafting recipes. Users burn the required moments, then you airdrop the reward.
        </p>
      </div>

      <div className="flex gap-1 rounded-lg bg-white/[0.03] p-1">
        {TOP_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition " +
              (tab === t.key ? "bg-orange-500/15 text-orange-300" : "text-zinc-400 hover:text-zinc-100")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "recipes" && <RecipesTab />}
      {tab === "submissions" && <SubmissionsTab />}
      {tab === "sold" && <SoldListTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recipes tab
// ---------------------------------------------------------------------------

function RecipesTab() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/forge", { cache: "no-store" });
      if (r.ok) setRecipes((await r.json()).recipes ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const startEdit = (r: Recipe) => {
    setEditingId(r.id);
    setForm({
      id: r.id,
      title: r.title,
      subtitle: r.subtitle ?? "",
      description: r.description ?? "",
      inputs: r.inputs.length ? r.inputs : [{ ...EMPTY_GROUP }],
      inputImageUrl: r.inputImageUrl ?? "",
      inputMomentUrl: r.inputMomentUrl ?? "",
      rewardTitle: r.rewardTitle,
      rewardDescription: r.rewardDescription ?? "",
      rewardSetId: r.rewardSetId == null ? "" : String(r.rewardSetId),
      rewardPlayId: r.rewardPlayId == null ? "" : String(r.rewardPlayId),
      rewardImageUrl: r.rewardImageUrl ?? "",
      rewardMomentUrl: r.rewardMomentUrl ?? "",
      maxPerUser: String(r.maxPerUser),
      maxTotal: r.maxTotal == null ? "" : String(r.maxTotal),
      startsAt: toLocalInput(r.startsAt),
      endsAt: toLocalInput(r.endsAt),
      accentColor: r.accentColor ?? "#f97316",
      enabled: r.enabled,
      requireSoldOrigin: r.requireSoldOrigin,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => { setEditingId(null); setForm(EMPTY_FORM); };

  const submit = async () => {
    if (!form.id || !form.title || !form.rewardTitle) {
      toast("id, title and reward title are required", "error");
      return;
    }
    if (form.inputs.length === 0) {
      toast("Add at least one required-moment group", "error");
      return;
    }
    setBusy(true);
    try {
      const body = {
        id: form.id,
        title: form.title,
        subtitle: form.subtitle || null,
        description: form.description || null,
        inputs: form.inputs.map((g) => ({
          label: g.label || null,
          setId: g.setId,
          playId: g.playId,
          series: g.series,
          tier: g.tier || null,
          count: g.count,
        })),
        inputImageUrl: form.inputImageUrl || null,
        inputMomentUrl: form.inputMomentUrl || null,
        rewardTitle: form.rewardTitle,
        rewardDescription: form.rewardDescription || null,
        rewardSetId: form.rewardSetId ? Number(form.rewardSetId) : null,
        rewardPlayId: form.rewardPlayId ? Number(form.rewardPlayId) : null,
        rewardImageUrl: form.rewardImageUrl || null,
        rewardMomentUrl: form.rewardMomentUrl || null,
        maxPerUser: Number(form.maxPerUser || "1"),
        maxTotal: form.maxTotal ? Number(form.maxTotal) : null,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        accentColor: form.accentColor || null,
        enabled: form.enabled,
        requireSoldOrigin: form.requireSoldOrigin,
      };
      const res = await fetch("/api/admin/forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      toast(editingId ? "Recipe updated" : "Recipe created", "success");
      cancelEdit();
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(`Delete recipe "${id}"? Its submissions will be removed too.`)) return;
    const res = await fetch(`/api/admin/forge/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) { toast("Deleted", "success"); await load(); }
    else toast("Delete failed", "error");
  };

  // Input group editing helpers
  const updateGroup = (i: number, patch: Partial<InputGroup>) =>
    setForm((f) => ({ ...f, inputs: f.inputs.map((g, gi) => (gi === i ? { ...g, ...patch } : g)) }));
  const addGroup = () => setForm((f) => ({ ...f, inputs: [...f.inputs, { ...EMPTY_GROUP }] }));
  const removeGroup = (i: number) =>
    setForm((f) => ({ ...f, inputs: f.inputs.filter((_, gi) => gi !== i) }));

  const num = (v: string): number | null => (v === "" ? null : Number(v));

  return (
    <div className="space-y-8">
      {/* Form */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="text-sm font-bold text-zinc-200">
          {editingId ? `Edit recipe: ${editingId}` : "New recipe"}
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Slug ID (a-z0-9-_)">
            <input className={inputCls} disabled={!!editingId} value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="summer-2026-forge" />
          </Field>
          <Field label="Title">
            <input className={inputCls} value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Summer Forge" />
          </Field>
          <Field label="Subtitle">
            <input className={inputCls} value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
          </Field>
          <Field label="Accent color">
            <input type="color" className="h-9 w-16 rounded bg-transparent" value={form.accentColor}
              onChange={(e) => setForm({ ...form, accentColor: e.target.value })} />
          </Field>
          <Field label="Description" full>
            <textarea className={inputCls} rows={2} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>

        {/* Required moments */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Required moments to burn</h3>
            <button onClick={addGroup} className="text-xs font-semibold text-orange-300 hover:text-orange-200">+ Add group</button>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Each group needs at least one selector (set / play / series / tier). Use the search to fill set+play.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Required moment image URL">
              <input className={inputCls} value={form.inputImageUrl}
                onChange={(e) => setForm({ ...form, inputImageUrl: e.target.value })}
                placeholder="https://assets.nbatopshot.com/..." />
            </Field>
            <Field label="Required moment Top Shot URL">
              <input className={inputCls} value={form.inputMomentUrl}
                onChange={(e) => setForm({ ...form, inputMomentUrl: e.target.value })}
                placeholder="https://nbatopshot.com/moment/..." />
            </Field>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            Shown to users as a preview of the moment they need to burn — even if they don&apos;t own it yet.
          </p>
          <div className="mt-3 space-y-3">
            {form.inputs.map((g, i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-black/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-zinc-400">Group {i + 1}</span>
                  {form.inputs.length > 1 && (
                    <button onClick={() => removeGroup(i)} className="text-[11px] text-red-400 hover:text-red-300">Remove</button>
                  )}
                </div>
                <MomentSearch onPick={(m) => updateGroup(i, {
                  setId: m.setId, playId: m.playId,
                  label: g.label ?? (m.playerName ?? m.setName ?? null),
                })} />
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
                  <MiniField label="Set ID"><input className={inputCls} value={g.setId ?? ""}
                    onChange={(e) => updateGroup(i, { setId: num(e.target.value) })} /></MiniField>
                  <MiniField label="Play ID"><input className={inputCls} value={g.playId ?? ""}
                    onChange={(e) => updateGroup(i, { playId: num(e.target.value) })} /></MiniField>
                  <MiniField label="Series"><input className={inputCls} value={g.series ?? ""}
                    onChange={(e) => updateGroup(i, { series: num(e.target.value) })} /></MiniField>
                  <MiniField label="Tier"><input className={inputCls} value={g.tier ?? ""}
                    onChange={(e) => updateGroup(i, { tier: e.target.value || null })} placeholder="common" /></MiniField>
                  <MiniField label="Qty"><input className={inputCls} type="number" min={1} value={g.count}
                    onChange={(e) => updateGroup(i, { count: Math.max(1, Number(e.target.value)) })} /></MiniField>
                  <MiniField label="Label"><input className={inputCls} value={g.label ?? ""}
                    onChange={(e) => updateGroup(i, { label: e.target.value || null })} /></MiniField>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reward */}
        <div className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Reward moment (airdropped)</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Reward title">
              <input className={inputCls} value={form.rewardTitle}
                onChange={(e) => setForm({ ...form, rewardTitle: e.target.value })} />
            </Field>
            <Field label="Reward description">
              <input className={inputCls} value={form.rewardDescription}
                onChange={(e) => setForm({ ...form, rewardDescription: e.target.value })} />
            </Field>
            <Field label="Reward set ID">
              <input className={inputCls} value={form.rewardSetId}
                onChange={(e) => setForm({ ...form, rewardSetId: e.target.value })} />
            </Field>
            <Field label="Reward play ID">
              <input className={inputCls} value={form.rewardPlayId}
                onChange={(e) => setForm({ ...form, rewardPlayId: e.target.value })} />
            </Field>
            <Field label="Reward image URL">
              <input className={inputCls} value={form.rewardImageUrl}
                onChange={(e) => setForm({ ...form, rewardImageUrl: e.target.value })} />
            </Field>
            <Field label="Reward Top Shot URL">
              <input className={inputCls} value={form.rewardMomentUrl}
                onChange={(e) => setForm({ ...form, rewardMomentUrl: e.target.value })} />
            </Field>
          </div>
        </div>

        {/* Limits */}
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <Field label="Max per user"><input className={inputCls} type="number" min={1} value={form.maxPerUser}
            onChange={(e) => setForm({ ...form, maxPerUser: e.target.value })} /></Field>
          <Field label="Max total (blank = ∞)"><input className={inputCls} value={form.maxTotal}
            onChange={(e) => setForm({ ...form, maxTotal: e.target.value })} /></Field>
          <Field label="Opens at"><input className={inputCls} type="datetime-local" value={form.startsAt}
            onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></Field>
          <Field label="Closes at"><input className={inputCls} type="datetime-local" value={form.endsAt}
            onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></Field>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          Enabled (visible to users)
        </label>

        <label className="mt-2 flex items-start gap-2 text-sm text-zinc-300">
          <input type="checkbox" className="mt-0.5" checked={form.requireSoldOrigin}
            onChange={(e) => setForm({ ...form, requireSoldOrigin: e.target.checked })} />
          <span>
            Require moments to originate from us
            <span className="block text-[11px] text-zinc-500">
              Only moments on the <span className="text-orange-300">Sold list</span> tab may be burned for this recipe.
            </span>
          </span>
        </label>

        <div className="mt-5 flex gap-2">
          <button onClick={submit} disabled={busy}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-50">
            {busy ? "Saving…" : editingId ? "Update recipe" : "Create recipe"}
          </button>
          {editingId && (
            <button onClick={cancelEdit} className="rounded-lg bg-white/5 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <div className="h-24 animate-pulse rounded-xl bg-white/5" />
        ) : recipes.length === 0 ? (
          <p className="text-sm text-zinc-500">No recipes yet.</p>
        ) : (
          recipes.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-100">{r.title}</span>
                  {!r.enabled && <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300">disabled</span>}
                  {r.requireSoldOrigin && <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] text-orange-300">sold-only</span>}
                </div>
                <p className="mt-0.5 font-mono text-[11px] text-zinc-500">{r.id}</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Burn {r.inputs.map((g) => `${g.count}× ${g.label ?? `set ${g.setId ?? "*"}/play ${g.playId ?? "*"}`}`).join(" + ")}
                  {" → "}<span className="text-orange-300">{r.rewardTitle}</span>
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {r.stats ? Object.entries(r.stats).map(([k, v]) => `${v} ${k.replace("_", " ")}`).join(" · ") : "no submissions"}
                </p>
              </div>
              <div className="flex flex-none gap-2">
                <button onClick={() => startEdit(r)} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10">Edit</button>
                <button onClick={() => remove(r.id)} className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20">Delete</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Submissions tab
// ---------------------------------------------------------------------------

function SubmissionsTab() {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<string>("burn_verified");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/forge/submissions?status=${status}`, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        setSubs(j.submissions ?? []);
        setStats(j.stats ?? {});
      }
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/forge/submissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Update failed");
      toast("Updated", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const markSent = (s: Submission) => {
    const tx = prompt("Optional: paste the airdrop transaction ID / link") ?? "";
    void patch(s.id, { status: "reward_sent", rewardTxId: tx || undefined });
  };
  const reject = (s: Submission) => {
    const note = prompt("Reason for rejection (shown to user):") ?? "";
    void patch(s.id, { status: "rejected", adminNote: note || undefined });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg bg-white/[0.03] p-1">
        {STATUS_TABS.map((t) => (
          <button key={t.key} onClick={() => setStatus(t.key)}
            className={
              "rounded-md px-3 py-1.5 text-xs font-medium transition " +
              (status === t.key ? "bg-orange-500/15 text-orange-300" : "text-zinc-400 hover:text-zinc-100")
            }>
            {t.label}{t.key && stats[t.key] ? ` (${stats[t.key]})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-24 animate-pulse rounded-xl bg-white/5" />
      ) : subs.length === 0 ? (
        <p className="text-sm text-zinc-500">No submissions in this state.</p>
      ) : (
        <div className="space-y-3">
          {subs.map((s) => (
            <div key={s.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-100">{s.recipe?.title ?? s.recipeId}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Reward: <span className="text-orange-300">{s.recipe?.rewardTitle ?? "—"}</span>
                    {s.recipe?.rewardPlayId != null && ` · set ${s.recipe.rewardSetId}/play ${s.recipe.rewardPlayId}`}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    User: <span className="font-medium text-zinc-200">{s.topshotUsername ?? "—"}</span>{" "}
                    <span className="font-mono text-zinc-500">{shortAddr(s.flowAddress)}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Burned {s.committedMomentIds.length} moment(s): {s.committedMomentIds.join(", ")}
                  </p>
                  {s.adminNote && <p className="mt-1 text-[11px] text-zinc-500">Note: {s.adminNote}</p>}
                  {s.rewardTxId && <p className="mt-1 text-[11px] text-zinc-500">Tx: {s.rewardTxId}</p>}
                </div>
                <span className={statusBadge(s.status)}>{s.status.replace("_", " ")}</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {s.status === "burn_verified" && (
                  <>
                    <button disabled={busyId === s.id} onClick={() => markSent(s)}
                      className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25">
                      Mark reward sent
                    </button>
                    <button disabled={busyId === s.id} onClick={() => reject(s)}
                      className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20">
                      Reject
                    </button>
                  </>
                )}
                {s.status === "reward_sent" && (
                  <button disabled={busyId === s.id} onClick={() => patch(s.id, { status: "burn_verified" })}
                    className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10">
                    Revert to ready
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const inputCls =
  "w-full rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-orange-400/50";

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={"flex flex-col gap-1 " + (full ? "sm:col-span-2" : "")}>
      <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</span>
      {children}
    </label>
  );
}

function statusBadge(status: string) {
  const base = "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ";
  switch (status) {
    case "burn_verified": return base + "bg-amber-500/15 text-amber-300";
    case "reward_sent": return base + "bg-emerald-500/15 text-emerald-300";
    case "pending_burn": return base + "bg-sky-500/15 text-sky-300";
    case "rejected": return base + "bg-red-500/15 text-red-300";
    default: return base + "bg-zinc-600/30 text-zinc-400";
  }
}

function MomentSearch({ onPick }: { onPick: (m: MomentSearchResult) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MomentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const h = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/admin/stack-challenges/moment-search?q=${encodeURIComponent(q)}`,
          { cache: "no-store" },
        );
        if (res.ok) setResults((await res.json()).results ?? []);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(h);
  }, [q]);

  return (
    <div className="relative mt-2">
      <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Search a player or set to fill set/play…" />
      {(searching || results.length > 0) && (
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-white/10 bg-zinc-900 shadow-xl">
          {searching && <p className="px-3 py-2 text-xs text-zinc-500">Searching…</p>}
          {results.map((m) => (
            <button key={`${m.setId}/${m.playId}`} type="button"
              onClick={() => { onPick(m); setQ(""); setResults([]); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/5">
              {m.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.thumbnailUrl} alt="" className="h-8 w-8 rounded object-cover" />
              )}
              <span className="min-w-0 flex-1 text-xs text-zinc-200">
                {m.playerName ?? m.setName ?? "moment"}{" "}
                <span className="text-zinc-500">set {m.setId}/play {m.playId} · {m.ownerCount} owners</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sold list tab — the allowlist of moment IDs that originated from us.
// ---------------------------------------------------------------------------

interface SoldEntry {
  moment_id: string;
  note: string | null;
  added_by: string | null;
  added_at: string;
}

function SoldListTab() {
  const [entries, setEntries] = useState<SoldEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bulk, setBulk] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/admin/forge/sold-moments?q=${encodeURIComponent(q)}`,
        { cache: "no-store" },
      );
      if (r.ok) {
        const j = await r.json();
        setEntries(j.entries ?? []);
        setTotal(j.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    const h = setTimeout(() => { void load(); }, 250);
    return () => clearTimeout(h);
  }, [load]);

  const add = async () => {
    const ids = bulk.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) { toast("Paste one or more moment IDs", "error"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/forge/sold-moments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ momentIds: ids, note: note || null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Add failed");
      toast(`Added ${j.added} moment(s)`, "success");
      setBulk("");
      setNote("");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Add failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (momentId: string) => {
    if (!confirm(`Remove moment ${momentId} from the sold list?`)) return;
    const res = await fetch("/api/admin/forge/sold-moments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ momentIds: [momentId] }),
    });
    if (res.ok) { toast("Removed", "success"); await load(); }
    else toast("Remove failed", "error");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="text-sm font-bold text-zinc-200">Add moments you sold</h2>
        <p className="mt-1 text-[11px] text-zinc-500">
          Paste Top Shot moment IDs (the long numbers), separated by spaces, commas, or new lines.
          Recipes with <span className="text-orange-300">&ldquo;Require moments to originate from us&rdquo;</span> will
          only accept burns of moments on this list.
        </p>
        <textarea className={inputCls + " mt-3 font-mono"} rows={4} value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          placeholder="12345678&#10;23456789, 34567890" />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Optional note</span>
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Series 4 Base sale batch" />
          </label>
          <button onClick={add} disabled={busy}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-50">
            {busy ? "Adding…" : "Add to list"}
          </button>
        </div>
      </div>

      <ImportCollectionPanel onImported={load} />

      <div className="flex items-center justify-between gap-3">
        <input className={inputCls + " max-w-xs"} value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search moment ID or note…" />
        <span className="text-xs text-zinc-500">{total} moment(s) on the list</span>
      </div>

      {loading ? (
        <div className="h-24 animate-pulse rounded-xl bg-white/5" />
      ) : entries.length === 0 ? (
        <p className="text-sm text-zinc-500">No moments on the sold list yet.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.moment_id}
              className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2.5">
              <div className="min-w-0">
                <span className="font-mono text-sm text-zinc-100">{e.moment_id}</span>
                {e.note && <span className="ml-2 text-xs text-zinc-500">{e.note}</span>}
                <p className="text-[11px] text-zinc-600">
                  added {new Date(e.added_at).toLocaleDateString()}
                  {e.added_by ? ` · ${shortAddr(e.added_by)}` : ""}
                </p>
              </div>
              <button onClick={() => remove(e.moment_id)}
                className="flex-none rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import-from-collection panel: pick a set/play you OWN and add every matching
// moment ID to the sold list in one click (reads owned_moments snapshot).
// ---------------------------------------------------------------------------

interface CollectionGroup {
  setId: number;
  playId: number;
  setName: string | null;
  playerName: string | null;
  series: number | null;
  count: number;
  alreadyOnList: number;
}

function ImportCollectionPanel({ onImported }: { onImported: () => void | Promise<void> }) {
  const [address, setAddress] = useState("");
  const [groups, setGroups] = useState<CollectionGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("forge.import.address") : null;
    if (saved) setAddress(saved);
  }, []);

  const loadCollection = async () => {
    const addr = address.trim().toLowerCase();
    if (!/^0x[0-9a-f]{16}$/.test(addr)) {
      toast("Enter a valid Flow address (0x + 16 hex chars)", "error");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(
        `/api/admin/forge/sold-moments/import?address=${encodeURIComponent(addr)}`,
        { cache: "no-store" },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Load failed");
      setGroups(j.groups ?? []);
      setTotal(j.total ?? 0);
      setLoaded(true);
      localStorage.setItem("forge.import.address", addr);
      if ((j.groups ?? []).length === 0) toast("No moments found in that collection snapshot", "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Load failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const importGroup = async (g: CollectionGroup | "all", key: string) => {
    const addr = address.trim().toLowerCase();
    setBusyKey(key);
    try {
      const body =
        g === "all"
          ? { address: addr, note: "Imported whole collection" }
          : {
              address: addr,
              setId: g.setId,
              playId: g.playId,
              note: `Imported ${g.playerName ?? g.setName ?? "moment"} (set ${g.setId}/play ${g.playId})`,
            };
      const res = await fetch("/api/admin/forge/sold-moments/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Import failed");
      toast(`Added ${j.added} moment(s) to the sold list`, "success");
      await onImported();
      await loadCollection();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Import failed", "error");
    } finally {
      setBusyKey(null);
    }
  };

  const visible = groups.filter((g) => {
    if (!filter.trim()) return true;
    const f = filter.toLowerCase();
    return (
      (g.playerName ?? "").toLowerCase().includes(f) ||
      (g.setName ?? "").toLowerCase().includes(f) ||
      String(g.setId).includes(f) ||
      String(g.playId).includes(f)
    );
  });

  const remainingTotal = groups.reduce((s, g) => s + (g.count - g.alreadyOnList), 0);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="text-sm font-bold text-zinc-200">Import from a collection you own</h2>
      <p className="mt-1 text-[11px] text-zinc-500">
        Enter the Flow address whose verified collection holds the moments (yours, or the wallet you sell
        from). Pick a moment or a whole set and add every copy you own to the sold list at once.
        Reads the latest verification snapshot — re-verify that wallet first if it&rsquo;s stale.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Flow address</span>
          <input className={inputCls + " font-mono"} value={address}
            onChange={(e) => setAddress(e.target.value)} placeholder="0x1234567890abcdef" />
        </label>
        <button onClick={loadCollection} disabled={loading}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-white/20 disabled:opacity-50">
          {loading ? "Loading…" : "Load collection"}
        </button>
      </div>

      {loaded && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <input className={inputCls + " max-w-xs"} value={filter}
              onChange={(e) => setFilter(e.target.value)} placeholder="Filter by player, set, or id…" />
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">
                {total} moment(s) · {remainingTotal} not yet on list
              </span>
              <button onClick={() => importGroup("all", "all")} disabled={busyKey != null || remainingTotal === 0}
                className="rounded-lg bg-orange-500/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-400 disabled:opacity-40">
                {busyKey === "all" ? "Adding…" : `Add entire collection (${remainingTotal})`}
              </button>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-zinc-500">No matching moments.</p>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {visible.map((g) => {
                const key = `${g.setId}/${g.playId}`;
                const remaining = g.count - g.alreadyOnList;
                return (
                  <div key={key}
                    className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2.5">
                    <div className="min-w-0">
                      <span className="text-sm text-zinc-100">{g.playerName ?? g.setName ?? "Moment"}</span>
                      <p className="text-[11px] text-zinc-600">
                        {g.setName ? `${g.setName} · ` : ""}set {g.setId}/play {g.playId}
                        {g.series != null ? ` · series ${g.series}` : ""} · you own {g.count}
                        {g.alreadyOnList > 0 ? ` · ${g.alreadyOnList} on list` : ""}
                      </p>
                    </div>
                    <button onClick={() => importGroup(g, key)}
                      disabled={busyKey != null || remaining === 0}
                      className="flex-none rounded-lg bg-orange-500/10 px-3 py-1.5 text-xs font-semibold text-orange-300 hover:bg-orange-500/20 disabled:opacity-40">
                      {busyKey === key ? "Adding…" : remaining === 0 ? "All added" : `Add all (${remaining})`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
