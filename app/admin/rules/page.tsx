"use client";

/**
 * app/admin/rules/page.tsx
 * Reward rules CRUD — moved from the monolithic /admin/page.tsx.
 */

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { RuleBuilderForm, type BuiltRule } from "@/components/RuleBuilderForm";
import { useCountdown } from "@/lib/useCountdown";

function ExpiryBadge({ expiresAt }: { expiresAt: string }) {
  const cd = useCountdown(expiresAt);
  if (!cd) return null;
  return (
    <span className={cd.expired ? "text-red-400" : "text-amber-300/80"}>
      {cd.expired ? "Expired" : `⏰ ${cd.label}`}
    </span>
  );
}

interface RuleRow {
  id: string;
  type: string;
  reward: string;
  payload: Record<string, unknown>;
  enabled: boolean;
  expires_at: string | null;
  is_physical: boolean;
  physical_title: string | null;
  physical_description: string | null;
  physical_image_url: string | null;
  notify_sent_at: string | null;
  notify_sent_count: number | null;
  created_at: string;
  updated_at: string;
}

export default function RulesPage() {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [editing, setEditing] = useState<(BuiltRule & { enabled: boolean }) | null>(null);
  const [formKey, setFormKey] = useState(0);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/rules", { cache: "no-store" });
      if (res.ok) {
        const { rules } = (await res.json()) as { rules: RuleRow[] };
        setRules(rules);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRules(); }, [fetchRules]);

  const submitRule = useCallback(
    async (
      rule: BuiltRule,
      enabled: boolean,
      expiresAt: string | null,
      isPhysical: boolean,
      physicalTitle: string | null,
      physicalDescription: string | null,
      physicalImageUrl: string | null,
    ) => {
      setMessage(null);
      setBusy(true);
      try {
        const res = await fetch("/api/admin/rules", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rule, enabled, expiresAt, isPhysical, physicalTitle, physicalDescription, physicalImageUrl }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) { setMessage({ kind: "error", text: body.error ?? `HTTP ${res.status}` }); return; }
        setMessage({ kind: "info", text: `Rule "${rule.id}" saved.` });
        setEditing(null);
        setFormKey((k) => k + 1);
        await fetchRules();
      } finally {
        setBusy(false);
      }
    },
    [fetchRules],
  );

  const toggleRule = useCallback(async (rule: RuleRow) => {
    setBusy(true);
    try {
      await fetch("/api/admin/rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rule: rule.payload, enabled: !rule.enabled }),
      });
      await fetchRules();
    } finally { setBusy(false); }
  }, [fetchRules]);

  const deleteRule = useCallback(async (id: string) => {
    if (!confirm(`Delete rule "${id}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/rules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await fetchRules();
    } finally { setBusy(false); }
  }, [fetchRules]);

  const notify = useCallback(async (rule: RuleRow) => {
    const flavour = window.prompt(
      `Send "${rule.id}" announcement email to all verified subscribers?\n\nOptional one-liner, or leave blank. Cancel to abort.`,
      "",
    );
    if (flavour === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/rules/${encodeURIComponent(rule.id)}/notify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: flavour || undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as { sent?: number; totalSubscribers?: number; failed?: number; error?: string };
      if (!res.ok) { setMessage({ kind: "error", text: body.error ?? `HTTP ${res.status}` }); return; }
      setMessage({ kind: "info", text: `Sent to ${body.sent ?? 0}/${body.totalSubscribers ?? 0} subscribers (${body.failed ?? 0} failed).` });
      await fetchRules();
    } finally { setBusy(false); }
  }, [fetchRules]);

  const seed = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/seed", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { seeded?: number; error?: string };
      if (!res.ok) { setMessage({ kind: "error", text: body.error ?? `HTTP ${res.status}` }); }
      else { setMessage({ kind: "info", text: `Seeded ${body.seeded} rule(s) from config.` }); }
      await fetchRules();
    } finally { setBusy(false); }
  }, [fetchRules]);

  const startEdit = useCallback((rule: RuleRow) => {
    setEditing({
      ...(rule.payload as unknown as BuiltRule),
      enabled: rule.enabled,
      expiresAt: rule.expires_at ?? null,
      isPhysical: rule.is_physical,
      physicalTitle: rule.physical_title ?? undefined,
      physicalDescription: rule.physical_description ?? undefined,
      physicalImageUrl: rule.physical_image_url ?? undefined,
    });
    setFormKey((k) => k + 1);
    setMessage({ kind: "info", text: `Editing rule "${rule.id}". Submit to save.` });
    setTimeout(() => { document.getElementById("rule-form")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 0);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Reward Rules</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage the rules the verifier evaluates. Enabled rules are used by{" "}
          <span className="font-mono">/api/verify</span>.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Rules</CardTitle>
            <CardDescription className="mt-1">
              Enabled rules are used by <span className="font-mono">/api/verify</span> — if none
              are enabled, the seeder falls back to <span className="font-mono">config/rewards.json</span>.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={seed} disabled={busy}>Seed from config</Button>
        </CardHeader>
        {loading ? (
          <CardContent className="text-sm text-zinc-500">Loading…</CardContent>
        ) : rules.length === 0 ? (
          <CardContent className="text-sm text-zinc-500">
            No rules yet. Add one below or click <strong>Seed from config</strong>.
          </CardContent>
        ) : (
          <CardContent className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{r.id}</span>
                    <Badge variant="outline" className="text-[10px]">{r.type}</Badge>
                    {r.enabled
                      ? <Badge className="bg-emerald-500/15 text-emerald-700 text-[10px] dark:text-emerald-300">enabled</Badge>
                      : <Badge variant="secondary" className="text-[10px]">disabled</Badge>}
                    {r.is_physical && (
                      <Badge className="bg-purple-500/15 text-purple-700 text-[10px] dark:text-purple-300">PHYSICAL</Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-zinc-500">
                    Reward: <span className="font-medium">{r.reward}</span>
                    {r.is_physical && r.physical_title && (
                      <span className="ml-2 text-purple-400">• {r.physical_title}</span>
                    )}
                  </p>
                  {r.expires_at && (
                    <p className="text-[11px] text-zinc-400"><ExpiryBadge expiresAt={r.expires_at} /></p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => startEdit(r)} disabled={busy}>Edit</Button>
                  <Button variant="outline" size="sm" onClick={() => toggleRule(r)} disabled={busy}>
                    {r.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => notify(r)}
                    disabled={busy || !!r.notify_sent_at}
                    title={r.notify_sent_at ? `Sent ${new Date(r.notify_sent_at).toLocaleString()} to ${r.notify_sent_count ?? 0} subscribers` : "Email all verified subscribers"}
                    className={r.notify_sent_at ? "text-zinc-400" : "text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"}
                  >
                    {r.notify_sent_at ? "✓ Notified" : "📣 Notify"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => deleteRule(r.id)} disabled={busy} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <Card id="rule-form">
        <CardHeader>
          <CardTitle>{editing ? `Edit rule "${editing.id}"` : "Add a rule"}</CardTitle>
          <CardDescription>
            Pick a rule type and fill in its fields. Re-using an existing{" "}
            <span className="font-mono">id</span> overwrites that rule.
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="pt-4">
          <RuleBuilderForm
            key={formKey}
            initial={editing ?? undefined}
            busy={busy}
            onSubmit={submitRule}
            onCancel={editing ? () => { setEditing(null); setFormKey((k) => k + 1); setMessage(null); } : undefined}
          />
          {message && (
            <p className={"mt-3 text-xs " + (message.kind === "error" ? "text-red-500" : "text-emerald-600 dark:text-emerald-400")}>
              {message.text}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
