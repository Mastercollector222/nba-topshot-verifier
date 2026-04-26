"use client";

/**
 * app/admin/page.tsx
 * ---------------------------------------------------------------------------
 * Admin CRUD UI for reward_rules. Gated by ADMIN_FLOW_ADDRESSES env var
 * (checked server-side via `/api/admin/me`).
 *
 * Flow:
 *   1. Check session + admin status via GET /api/admin/me.
 *   2. If admin: list rules from GET /api/admin/rules, render a form to
 *      add/edit (JSON payload), plus toggle + delete affordances per row.
 *   3. "Seed from config" button calls POST /api/admin/seed.
 *
 * Rule payload is authored as JSON — easier than building three distinct
 * forms for three rule shapes. Server re-validates every submit.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { RuleBuilderForm, type BuiltRule } from "@/components/RuleBuilderForm";
import { AdminClaimsTable } from "@/components/AdminClaimsTable";
import { SiteHeader } from "@/components/SiteHeader";

interface RuleRow {
  id: string;
  type: string;
  reward: string;
  payload: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface MeResponse {
  address: string | null;
  isAdmin: boolean;
}

export default function AdminPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [editing, setEditing] = useState<(BuiltRule & { enabled: boolean }) | null>(null);
  const [formKey, setFormKey] = useState(0); // bump to force remount / reset

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const meRes = await fetch("/api/admin/me", { cache: "no-store" });
      const meData = (await meRes.json()) as MeResponse;
      setMe(meData);
      if (!meData.isAdmin) return;

      const rulesRes = await fetch("/api/admin/rules", { cache: "no-store" });
      if (rulesRes.ok) {
        const { rules } = (await rulesRes.json()) as { rules: RuleRow[] };
        setRules(rules);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const submitRule = useCallback(
    async (rule: BuiltRule, enabled: boolean) => {
      setMessage(null);
      setBusy(true);
      try {
        const res = await fetch("/api/admin/rules", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rule, enabled }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setMessage({ kind: "error", text: body.error ?? `HTTP ${res.status}` });
          return;
        }
        setMessage({ kind: "info", text: `Rule "${rule.id}" saved.` });
        setEditing(null);
        setFormKey((k) => k + 1);
        await fetchAll();
      } finally {
        setBusy(false);
      }
    },
    [fetchAll],
  );

  const toggleRule = useCallback(
    async (rule: RuleRow) => {
      setBusy(true);
      try {
        await fetch("/api/admin/rules", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rule: rule.payload, enabled: !rule.enabled }),
        });
        await fetchAll();
      } finally {
        setBusy(false);
      }
    },
    [fetchAll],
  );

  const deleteRule = useCallback(
    async (id: string) => {
      if (!confirm(`Delete rule "${id}"? This cannot be undone.`)) return;
      setBusy(true);
      try {
        await fetch(`/api/admin/rules?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        await fetchAll();
      } finally {
        setBusy(false);
      }
    },
    [fetchAll],
  );

  const seed = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/seed", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        seeded?: number;
        error?: string;
      };
      if (!res.ok) {
        setMessage({ kind: "error", text: body.error ?? `HTTP ${res.status}` });
      } else {
        setMessage({ kind: "info", text: `Seeded ${body.seeded} rule(s) from config.` });
      }
      await fetchAll();
    } finally {
      setBusy(false);
    }
  }, [fetchAll]);

  const loadIntoForm = useCallback((rule: RuleRow) => {
    setEditing({
      ...(rule.payload as unknown as BuiltRule),
      enabled: rule.enabled,
    });
    setFormKey((k) => k + 1);
    setMessage({ kind: "info", text: `Editing rule "${rule.id}". Submit to save.` });
    // Scroll to form
    if (typeof window !== "undefined") {
      setTimeout(() => {
        document.getElementById("rule-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  }, []);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader subtitle="Admin" showAdminLink={false} />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-zinc-500">
              Checking admin access…
            </CardContent>
          </Card>
        ) : !me?.isAdmin ? (
          <Card>
            <CardHeader>
              <CardTitle>Admin access required</CardTitle>
              <CardDescription>
                {me?.address
                  ? <>Address <span className="font-mono">{me.address}</span> is not in <span className="font-mono">ADMIN_FLOW_ADDRESSES</span>.</>
                  : "Sign in from the dashboard first, then add your address to the env allowlist."}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Reward rules</CardTitle>
                  <CardDescription className="mt-1">
                    Manage the rules the verifier evaluates. Enabled rules are
                    used by <span className="font-mono">/api/verify</span> — if
                    none are enabled, the seeder falls back to{" "}
                    <span className="font-mono">config/rewards.json</span>.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" asChild>
                    <a href="/admin/tsr">Users &amp; TSR</a>
                  </Button>
                  <Button variant="outline" onClick={seed} disabled={busy}>
                    Seed from config
                  </Button>
                </div>
              </CardHeader>
              {rules.length === 0 ? (
                <CardContent className="text-sm text-zinc-500">
                  No rules yet. Add one below or click <strong>Seed from config</strong>.
                </CardContent>
              ) : (
                <CardContent className="space-y-2">
                  {rules.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">
                            {r.id}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {r.type}
                          </Badge>
                          {r.enabled ? (
                            <Badge className="bg-emerald-500/15 text-emerald-700 text-[10px] dark:text-emerald-300">
                              enabled
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              disabled
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-xs text-zinc-500">
                          Reward: <span className="font-medium">{r.reward}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => loadIntoForm(r)}
                          disabled={busy}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleRule(r)}
                          disabled={busy}
                        >
                          {r.enabled ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteRule(r.id)}
                          disabled={busy}
                          className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
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
                <CardTitle>
                  {editing ? `Edit rule “${editing.id}”` : "Add a rule"}
                </CardTitle>
                <CardDescription>
                  Pick a rule type and fill in its fields. Re-using an existing
                  <span className="font-mono"> id</span> overwrites that rule.
                  Server re-validates on submit.
                </CardDescription>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4">
                <RuleBuilderForm
                  key={formKey}
                  initial={editing ?? undefined}
                  busy={busy}
                  onSubmit={submitRule}
                  onCancel={
                    editing
                      ? () => {
                          setEditing(null);
                          setFormKey((k) => k + 1);
                          setMessage(null);
                        }
                      : undefined
                  }
                />
                {message ? (
                  <p
                    className={
                      "mt-3 text-xs " +
                      (message.kind === "error"
                        ? "text-red-500"
                        : "text-emerald-600 dark:text-emerald-400")
                    }
                  >
                    {message.text}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <AdminClaimsTable />
          </>
        )}
      </main>
    </div>
  );
}
