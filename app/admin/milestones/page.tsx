"use client";

/**
 * app/admin/milestones/page.tsx
 * ---------------------------------------------------------------------------
 * Admin CRUD UI for TSR milestones. Gated by admin auth (checked via
 * GET /api/admin/me). Lets the admin create, edit, toggle, and delete
 * TSR point milestones.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { MilestoneClaimsAdmin } from "@/components/MilestoneClaimsAdmin";

interface Milestone {
  id: string;
  threshold: number;
  reward_label: string;
  bonus_tsr: number;
  moment_description: string | null;
  enabled: boolean;
  created_at: string;
}

interface FormState {
  threshold: string;
  reward_label: string;
  bonus_tsr: string;
  moment_description: string;
  enabled: boolean;
}

const EMPTY_FORM: FormState = {
  threshold: "",
  reward_label: "",
  bonus_tsr: "0",
  moment_description: "",
  enabled: true,
};

export default function AdminMilestonesPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  // Check admin access
  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => setIsAdmin(d.isAdmin === true))
      .catch(() => setIsAdmin(false));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/milestones");
      const d = await r.json();
      setMilestones(d.milestones ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  function startEdit(m: Milestone) {
    setEditingId(m.id);
    setForm({
      threshold: String(m.threshold),
      reward_label: m.reward_label,
      bonus_tsr: String(m.bonus_tsr),
      moment_description: m.moment_description ?? "",
      enabled: m.enabled,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const payload = {
        threshold: Number(form.threshold),
        reward_label: form.reward_label,
        bonus_tsr: Number(form.bonus_tsr),
        moment_description: form.moment_description || null,
        enabled: form.enabled,
        ...(editingId ? { id: editingId } : {}),
      };
      const r = await fetch("/api/admin/milestones", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Request failed");
      setMessage({ kind: "info", text: editingId ? "Milestone updated." : "Milestone created." });
      cancelEdit();
      load();
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this milestone? This cannot be undone.")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/milestones?id=${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error);
      setMessage({ kind: "info", text: "Milestone deleted." });
      load();
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(m: Milestone) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/milestones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, enabled: !m.enabled }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      load();
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (isAdmin === null) {
    return (
      <div className="min-h-screen bg-[oklch(0.08_0.008_265)] text-zinc-100">
        <SiteHeader subtitle="Admin · Milestones" showAdminLink />
        <div className="flex items-center justify-center py-32 text-zinc-400">Loading…</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[oklch(0.08_0.008_265)] text-zinc-100">
        <SiteHeader subtitle="Admin · Milestones" showAdminLink />
        <div className="flex items-center justify-center py-32 text-red-400">Access denied.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[oklch(0.08_0.008_265)] text-zinc-100">
      <SiteHeader subtitle="Admin · Milestones" showAdminLink />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">TSR Milestones</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Set TSR point thresholds. When users reach them they can claim an airdrop.
            </p>
          </div>
          <a
            href="/admin"
            className="text-xs uppercase tracking-[0.18em] text-zinc-400 transition hover:text-orange-400"
          >
            ← Admin
          </a>
        </div>

        {message ? (
          <div
            className={
              "mb-6 rounded-xl border px-4 py-3 text-sm " +
              (message.kind === "error"
                ? "border-red-500/30 bg-red-500/10 text-red-300"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300")
            }
          >
            {message.text}
          </div>
        ) : null}

        {/* Create / Edit form */}
        <div className="mb-10 rounded-2xl border border-white/5 bg-white/[0.03] p-6">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-orange-400/80">
            {editingId ? "Edit Milestone" : "New Milestone"}
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-zinc-400">
                TSR Threshold *
              </label>
              <input
                type="number"
                min={1}
                required
                value={form.threshold}
                onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-orange-400/50 focus:outline-none"
                placeholder="e.g. 500"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-zinc-400">
                Reward Label *
              </label>
              <input
                type="text"
                required
                value={form.reward_label}
                onChange={(e) => setForm((f) => ({ ...f, reward_label: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-orange-400/50 focus:outline-none"
                placeholder="e.g. Legendary Moment Airdrop"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-zinc-400">
                Bonus TSR Points
              </label>
              <input
                type="number"
                min={0}
                value={form.bonus_tsr}
                onChange={(e) => setForm((f) => ({ ...f, bonus_tsr: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-orange-400/50 focus:outline-none"
                placeholder="0"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-zinc-400">
                Moment Description
              </label>
              <input
                type="text"
                value={form.moment_description}
                onChange={(e) => setForm((f) => ({ ...f, moment_description: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-orange-400/50 focus:outline-none"
                placeholder="e.g. Series 4 Rare or better"
              />
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <label className="relative inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-white/20 bg-white/10 accent-orange-400"
                />
                Enabled (visible to users)
              </label>
            </div>
            <div className="flex gap-3 sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {editingId ? "Save Changes" : "Create Milestone"}
              </Button>
              {editingId ? (
                <Button type="button" variant="outline" onClick={cancelEdit}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </div>

        {/* Milestones list */}
        <div className="flex flex-col gap-3">
          {loading ? (
            <div className="py-10 text-center text-zinc-400">Loading…</div>
          ) : milestones.length === 0 ? (
            <div className="py-10 text-center text-zinc-500">No milestones yet.</div>
          ) : (
            milestones.map((m) => (
              <div
                key={m.id}
                className={
                  "flex flex-wrap items-start justify-between gap-4 rounded-2xl border p-5 " +
                  (m.enabled ? "border-white/5 bg-white/[0.03]" : "border-white/5 bg-white/[0.015] opacity-60")
                }
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xl font-semibold text-orange-300">
                      {m.threshold.toLocaleString()} TSR
                    </span>
                    {!m.enabled && (
                      <span className="rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-zinc-400">
                        Disabled
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-zinc-100">{m.reward_label}</p>
                  {m.moment_description ? (
                    <p className="text-xs text-zinc-400">{m.moment_description}</p>
                  ) : null}
                  {m.bonus_tsr > 0 ? (
                    <p className="text-[11px] text-emerald-400">+{m.bonus_tsr} bonus TSR on claim</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggle(m)}
                    disabled={busy}
                  >
                    {m.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => startEdit(m)}
                    disabled={busy}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(m.id)}
                    disabled={busy}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mx-auto w-full max-w-5xl px-6 pb-10">
          <MilestoneClaimsAdmin />
        </div>
      </main>
    </div>
  );
}
