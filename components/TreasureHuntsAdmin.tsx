"use client";

/**
 * components/TreasureHuntsAdmin.tsx
 * ---------------------------------------------------------------------------
 * Admin section for the Treasure Hunt feature. Three areas:
 *
 *   1. Global Gate    — singleton RewardRule the user must satisfy to
 *                       see /treasure-hunt at all. Backed by
 *                       /api/admin/treasure-hunt-settings.
 *   2. Hunts list     — every hunt (enabled + disabled) with quick
 *                       actions: edit / toggle enabled / view entries
 *                       / delete.
 *   3. Hunt builder   — form for creating or editing a single hunt:
 *                       title, theme, prize, time window, optional
 *                       per-hunt gate, and an ordered list of tasks.
 *                       Tasks reuse the existing `RuleBuilderForm`.
 *
 * All mutations go through /api/admin/* routes which re-validate. The
 * UI is purely orchestration.
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RuleBuilderForm, type BuiltRule } from "@/components/RuleBuilderForm";

// ---------------------------------------------------------------------------
// Wire types — match the API responses.
// ---------------------------------------------------------------------------

interface RewardRuleLite {
  id: string;
  type: string;
  reward: string;
  [k: string]: unknown;
}

interface HuntDto {
  id: string;
  title: string;
  theme: string | null;
  description: string | null;
  prizeTitle: string;
  prizeDescription: string | null;
  prizeImageUrl: string | null;
  startsAt: string;
  endsAt: string;
  gateRule: RewardRuleLite | null;
  taskRules: RewardRuleLite[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface EntryDto {
  flowAddress: string;
  username: string | null;
  enteredAt: string;
}

// ---------------------------------------------------------------------------
// Helpers — datetime-local <-> ISO conversion. <input type="datetime-local">
// hands us "YYYY-MM-DDTHH:mm" with no timezone; we treat that as local
// time and convert to a UTC ISO string for the wire.
// ---------------------------------------------------------------------------

function isoToLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

// Convert a stored RewardRule (as JSONB) to the BuiltRule shape that
// RuleBuilderForm understands. The two are structurally compatible —
// this is mostly a type assertion to satisfy TS.
function ruleToBuilt(r: RewardRuleLite): BuiltRule {
  return r as unknown as BuiltRule;
}

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

export function TreasureHuntsAdmin() {
  const [hunts, setHunts] = useState<HuntDto[]>([]);
  const [globalGate, setGlobalGate] = useState<RewardRuleLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<
    { kind: "info" | "error"; text: string } | null
  >(null);

  // Hunt being created or edited. `null` = list view, no form.
  const [editingHunt, setEditingHunt] = useState<HuntDto | null>(null);
  // Whether the gate-editor form is visible (independent of editingHunt).
  const [editingGate, setEditingGate] = useState(false);
  // For showing entries inline below a hunt row.
  const [entriesFor, setEntriesFor] = useState<string | null>(null);
  const [entries, setEntries] = useState<EntryDto[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, huntsRes] = await Promise.all([
        fetch("/api/admin/treasure-hunt-settings", { cache: "no-store" }),
        fetch("/api/admin/treasure-hunts", { cache: "no-store" }),
      ]);
      if (settingsRes.ok) {
        const { globalGate } = (await settingsRes.json()) as {
          globalGate: RewardRuleLite | null;
        };
        setGlobalGate(globalGate);
      }
      if (huntsRes.ok) {
        const { hunts } = (await huntsRes.json()) as { hunts: HuntDto[] };
        setHunts(hunts);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // -------------------------------------------------------------------
  // Global gate operations
  // -------------------------------------------------------------------

  const saveGate = useCallback(
    async (rule: BuiltRule | null) => {
      setBusy(true);
      setMessage(null);
      try {
        const res = await fetch("/api/admin/treasure-hunt-settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ globalGate: rule }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          setMessage({ kind: "error", text: body.error ?? `HTTP ${res.status}` });
          return;
        }
        setMessage({
          kind: "info",
          text: rule ? "Global gate saved." : "Global gate removed.",
        });
        setEditingGate(false);
        await fetchAll();
      } finally {
        setBusy(false);
      }
    },
    [fetchAll],
  );

  // -------------------------------------------------------------------
  // Hunt CRUD
  // -------------------------------------------------------------------

  const saveHunt = useCallback(
    async (payload: HuntDto) => {
      setBusy(true);
      setMessage(null);
      try {
        const res = await fetch("/api/admin/treasure-hunts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          setMessage({
            kind: "error",
            text: body.error ?? `HTTP ${res.status}`,
          });
          return;
        }
        setMessage({ kind: "info", text: `Hunt "${payload.title}" saved.` });
        setEditingHunt(null);
        await fetchAll();
      } finally {
        setBusy(false);
      }
    },
    [fetchAll],
  );

  const toggleHunt = useCallback(
    async (hunt: HuntDto) => {
      // Re-uses POST upsert with `enabled` flipped. Server re-validates.
      const next: HuntDto = { ...hunt, enabled: !hunt.enabled };
      await saveHunt(next);
    },
    [saveHunt],
  );

  const deleteHunt = useCallback(
    async (id: string, title: string) => {
      if (!confirm(`Delete hunt "${title}"? This also clears every entry.`)) {
        return;
      }
      setBusy(true);
      setMessage(null);
      try {
        const res = await fetch(
          `/api/admin/treasure-hunts/${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setMessage({
            kind: "error",
            text: body.error ?? `HTTP ${res.status}`,
          });
          return;
        }
        setMessage({ kind: "info", text: `Hunt "${title}" deleted.` });
        if (entriesFor === id) setEntriesFor(null);
        await fetchAll();
      } finally {
        setBusy(false);
      }
    },
    [fetchAll, entriesFor],
  );

  const loadEntries = useCallback(
    async (id: string) => {
      if (entriesFor === id) {
        setEntriesFor(null);
        setEntries([]);
        return;
      }
      setBusy(true);
      try {
        const res = await fetch(
          `/api/admin/treasure-hunts/${encodeURIComponent(id)}/entries`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const { entries } = (await res.json()) as { entries: EntryDto[] };
          setEntries(entries);
          setEntriesFor(id);
        }
      } finally {
        setBusy(false);
      }
    },
    [entriesFor],
  );

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-zinc-500">
          Loading treasure hunts…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ============== Global Gate ============== */}
      <Card>
        <CardHeader>
          <CardTitle>Treasure Hunt — Global Access Gate</CardTitle>
          <CardDescription>
            Singleton rule that protects the entire{" "}
            <span className="font-mono">/treasure-hunt</span> page. Users
            who don&apos;t satisfy this gate see a locked banner. Default:
            own 5 of play 4732 with all 5 locked.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {globalGate ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-50/40 p-3 dark:border-amber-400/30 dark:bg-amber-950/20">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">
                    {globalGate.id}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {globalGate.type}
                  </Badge>
                </div>
                <pre className="mt-2 overflow-x-auto rounded bg-black/5 p-2 text-[11px] dark:bg-white/5">
                  {JSON.stringify(globalGate, null, 2)}
                </pre>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingGate(true)}
                  disabled={busy}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm("Remove the global gate? Anyone signed in will be able to see /treasure-hunt.")) {
                      void saveGate(null);
                    }
                  }}
                  disabled={busy}
                  className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 p-3 text-sm text-zinc-500 dark:border-zinc-800">
              <span>No global gate — anyone signed in can view the page.</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingGate(true)}
                disabled={busy}
              >
                Set a gate
              </Button>
            </div>
          )}

          {editingGate ? (
            <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                Global gate rule
              </p>
              <RuleBuilderForm
                initial={globalGate ? ruleToBuilt(globalGate) : undefined}
                busy={busy}
                onSubmit={(rule) => saveGate(rule)}
                onCancel={() => setEditingGate(false)}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ============== Hunts list ============== */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Treasure Hunts</CardTitle>
            <CardDescription className="mt-1">
              Time-limited multi-task challenges with physical prizes.
              Disabled hunts are hidden from users.
            </CardDescription>
          </div>
          {!editingHunt ? (
            <Button onClick={() => setEditingHunt(blankHunt())} disabled={busy}>
              + New hunt
            </Button>
          ) : null}
        </CardHeader>
        {hunts.length === 0 ? (
          <CardContent className="text-sm text-zinc-500">
            No hunts yet. Click <strong>New hunt</strong> to create one.
          </CardContent>
        ) : (
          <CardContent className="space-y-2">
            {hunts.map((h) => (
              <HuntListRow
                key={h.id}
                hunt={h}
                busy={busy}
                isEntriesOpen={entriesFor === h.id}
                entries={entriesFor === h.id ? entries : []}
                onEdit={() => setEditingHunt(h)}
                onToggle={() => toggleHunt(h)}
                onDelete={() => deleteHunt(h.id, h.title)}
                onEntries={() => loadEntries(h.id)}
              />
            ))}
          </CardContent>
        )}
      </Card>

      {/* ============== Hunt builder ============== */}
      {editingHunt ? (
        <HuntBuilder
          key={editingHunt.id || "new"}
          initial={editingHunt}
          busy={busy}
          onSubmit={saveHunt}
          onCancel={() => setEditingHunt(null)}
        />
      ) : null}

      {message ? (
        <p
          className={
            "text-xs " +
            (message.kind === "error"
              ? "text-red-500"
              : "text-emerald-600 dark:text-emerald-400")
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers / sub-components
// ---------------------------------------------------------------------------

function blankHunt(): HuntDto {
  // Defaults: starts now, ends in 30 days. Admin can adjust.
  const now = new Date();
  const ends = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    id: "",
    title: "",
    theme: null,
    description: null,
    prizeTitle: "",
    prizeDescription: null,
    prizeImageUrl: null,
    startsAt: now.toISOString(),
    endsAt: ends.toISOString(),
    gateRule: null,
    taskRules: [],
    enabled: true,
    createdAt: "",
    updatedAt: "",
  };
}

interface HuntListRowProps {
  hunt: HuntDto;
  busy: boolean;
  isEntriesOpen: boolean;
  entries: EntryDto[];
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onEntries: () => void;
}

function HuntListRow({
  hunt,
  busy,
  isEntriesOpen,
  entries,
  onEdit,
  onToggle,
  onDelete,
  onEntries,
}: HuntListRowProps) {
  const now = Date.now();
  const startsMs = Date.parse(hunt.startsAt);
  const endsMs = Date.parse(hunt.endsAt);
  const status =
    now < startsMs
      ? "upcoming"
      : now >= endsMs
        ? "ended"
        : "active";

  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium">{hunt.id}</span>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              · {hunt.title}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {hunt.taskRules.length} task
              {hunt.taskRules.length === 1 ? "" : "s"}
            </Badge>
            {hunt.enabled ? (
              <Badge className="bg-emerald-500/15 text-emerald-700 text-[10px] dark:text-emerald-300">
                enabled
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">
                disabled
              </Badge>
            )}
            <Badge
              className={
                "text-[10px] " +
                (status === "active"
                  ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                  : status === "upcoming"
                    ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                    : "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400")
              }
            >
              {status}
            </Badge>
          </div>
          <p className="mt-1 truncate text-xs text-zinc-500">
            Prize: <span className="font-medium">{hunt.prizeTitle}</span> ·
            {" "}
            {new Date(hunt.startsAt).toLocaleDateString()} →{" "}
            {new Date(hunt.endsAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onEdit} disabled={busy}>
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={onToggle} disabled={busy}>
            {hunt.enabled ? "Disable" : "Enable"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onEntries}
            disabled={busy}
          >
            {isEntriesOpen ? "Hide entries" : "Entries"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={busy}
            className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Delete
          </Button>
        </div>
      </div>
      {isEntriesOpen ? (
        <div className="border-t border-zinc-200 bg-zinc-50/50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
          {entries.length === 0 ? (
            <p className="text-zinc-500">No entries yet.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="pb-1">User</th>
                  <th className="pb-1">Address</th>
                  <th className="pb-1">Entered</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.flowAddress} className="border-t border-zinc-200/50 dark:border-zinc-800/50">
                    <td className="py-1">{e.username ?? "—"}</td>
                    <td className="py-1 font-mono">{e.flowAddress}</td>
                    <td className="py-1">
                      {new Date(e.enteredAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hunt builder — composes basic fields, optional gate, and task list.
// ---------------------------------------------------------------------------

interface HuntBuilderProps {
  initial: HuntDto;
  busy: boolean;
  onSubmit: (h: HuntDto) => void | Promise<void>;
  onCancel: () => void;
}

function HuntBuilder({ initial, busy, onSubmit, onCancel }: HuntBuilderProps) {
  const [id, setId] = useState(initial.id);
  const [title, setTitle] = useState(initial.title);
  const [theme, setTheme] = useState(initial.theme ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [prizeTitle, setPrizeTitle] = useState(initial.prizeTitle);
  const [prizeDescription, setPrizeDescription] = useState(
    initial.prizeDescription ?? "",
  );
  const [prizeImageUrl, setPrizeImageUrl] = useState(initial.prizeImageUrl ?? "");
  const [startsAt, setStartsAt] = useState(isoToLocalInput(initial.startsAt));
  const [endsAt, setEndsAt] = useState(isoToLocalInput(initial.endsAt));
  const [enabled, setEnabled] = useState(initial.enabled);

  // Per-hunt gate (optional). null when no gate.
  const [gateRule, setGateRule] = useState<RewardRuleLite | null>(
    initial.gateRule,
  );
  const [editingGate, setEditingGate] = useState(false);

  // Tasks list. Each is a single RewardRule. Order = display order.
  const [tasks, setTasks] = useState<RewardRuleLite[]>(initial.taskRules);
  const [taskEditing, setTaskEditing] = useState<
    { mode: "new" } | { mode: "edit"; index: number } | null
  >(null);

  const isEdit = !!initial.id && initial.createdAt !== "";

  const upsertTask = useCallback(
    (rule: BuiltRule) => {
      setTasks((prev) => {
        const next = [...prev];
        const cast = rule as unknown as RewardRuleLite;
        if (taskEditing && taskEditing.mode === "edit") {
          next[taskEditing.index] = cast;
        } else {
          // Reject duplicate id within this hunt.
          if (next.some((t) => t.id === cast.id)) {
            alert(
              `A task with id "${cast.id}" already exists in this hunt. Pick a different id.`,
            );
            return prev;
          }
          next.push(cast);
        }
        return next;
      });
      setTaskEditing(null);
    },
    [taskEditing],
  );

  const removeTask = useCallback((index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveTask = useCallback((index: number, dir: -1 | 1) => {
    setTasks((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    const startsIso = localInputToIso(startsAt);
    const endsIso = localInputToIso(endsAt);
    if (!id.trim() || !title.trim() || !prizeTitle.trim()) {
      alert("id, title, and prize title are required.");
      return;
    }
    if (!startsIso || !endsIso) {
      alert("Both start and end dates are required.");
      return;
    }
    if (Date.parse(endsIso) <= Date.parse(startsIso)) {
      alert("End date must be after start date.");
      return;
    }
    if (tasks.length === 0) {
      alert("Add at least one task before saving.");
      return;
    }
    void onSubmit({
      ...initial,
      id: id.trim(),
      title: title.trim(),
      theme: theme.trim() || null,
      description: description.trim() || null,
      prizeTitle: prizeTitle.trim(),
      prizeDescription: prizeDescription.trim() || null,
      prizeImageUrl: prizeImageUrl.trim() || null,
      startsAt: startsIso,
      endsAt: endsIso,
      gateRule,
      taskRules: tasks,
      enabled,
    });
  }, [
    id,
    title,
    theme,
    description,
    prizeTitle,
    prizeDescription,
    prizeImageUrl,
    startsAt,
    endsAt,
    gateRule,
    tasks,
    enabled,
    initial,
    onSubmit,
  ]);

  return (
    <Card id="hunt-form" className="border-amber-500/40">
      <CardHeader>
        <CardTitle>{isEdit ? `Edit hunt “${initial.title}”` : "New hunt"}</CardTitle>
        <CardDescription>
          A hunt is metadata + a list of tasks. Each task is a reward rule
          evaluated by the existing verifier (locking gates supported).
        </CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-6 pt-4">
        {/* Basic identity */}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="hunt-id">Slug ID *</Label>
            <Input
              id="hunt-id"
              placeholder="e.g. spring-2026-hunt"
              value={id}
              onChange={(e) => setId(e.target.value)}
              disabled={busy || isEdit}
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              URL-safe slug. Cannot be changed after creation.
            </p>
          </div>
          <div>
            <Label htmlFor="hunt-title">Title *</Label>
            <Input
              id="hunt-title"
              placeholder="Spring Treasure Hunt"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="hunt-desc">Description</Label>
            <textarea
              id="hunt-desc"
              rows={2}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
              placeholder="One or two sentences shown on the hunt's detail page."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <Label htmlFor="hunt-theme">Theme accent (optional)</Label>
            <Input
              id="hunt-theme"
              placeholder="gold | emerald | crimson"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              disabled={busy}
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              Cosmetic only. Free-form label the public page can switch on.
            </p>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={busy}
              />
              Enabled (visible to users)
            </label>
          </div>
        </div>

        <Separator />

        {/* Prize */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <p className="text-sm font-medium">Prize</p>
            <p className="text-[11px] text-zinc-500">
              Physical prize details — shown prominently on the hunt page.
            </p>
          </div>
          <div>
            <Label htmlFor="prize-title">Prize title *</Label>
            <Input
              id="prize-title"
              placeholder="1 oz Silver Round"
              value={prizeTitle}
              onChange={(e) => setPrizeTitle(e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <Label htmlFor="prize-img">Prize image URL</Label>
            <Input
              id="prize-img"
              placeholder="https://…/silver-round.png"
              value={prizeImageUrl}
              onChange={(e) => setPrizeImageUrl(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="prize-desc">Prize description</Label>
            <textarea
              id="prize-desc"
              rows={2}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
              placeholder=".999 fine silver, 1oz, custom NBA Top Shot logo design."
              value={prizeDescription}
              onChange={(e) => setPrizeDescription(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <Separator />

        {/* Time window */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <p className="text-sm font-medium">Active window</p>
            <p className="text-[11px] text-zinc-500">
              Users can enter the drawing only between these timestamps.
              Times are in your local timezone; stored as UTC.
            </p>
          </div>
          <div>
            <Label htmlFor="hunt-starts">Starts at *</Label>
            <Input
              id="hunt-starts"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <Label htmlFor="hunt-ends">Ends at *</Label>
            <Input
              id="hunt-ends"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <Separator />

        {/* Per-hunt gate */}
        <div className="rounded-md border border-sky-500/40 bg-sky-50/30 p-4 dark:border-sky-400/30 dark:bg-sky-950/20">
          <p className="text-sm font-medium">Per-hunt gate (optional)</p>
          <p className="text-[11px] text-zinc-500">
            ADDITIONAL gate beyond the global gate. Useful for &quot;VIP&quot;
            hunts that require a specific Moment on top of the global access.
          </p>
          {gateRule ? (
            <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-md border border-sky-300 bg-white/50 p-3 dark:border-sky-800 dark:bg-zinc-950/40">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{gateRule.id}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {gateRule.type}
                  </Badge>
                </div>
                <pre className="mt-1 overflow-x-auto rounded bg-black/5 p-2 text-[10px] dark:bg-white/5">
                  {JSON.stringify(gateRule, null, 2)}
                </pre>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingGate(true)}
                  disabled={busy}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setGateRule(null)}
                  disabled={busy}
                  className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingGate(true)}
                disabled={busy}
              >
                + Add a gate rule
              </Button>
            </div>
          )}

          {editingGate ? (
            <div className="mt-3 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <RuleBuilderForm
                initial={gateRule ? ruleToBuilt(gateRule) : undefined}
                busy={busy}
                onSubmit={(rule) => {
                  setGateRule(rule as unknown as RewardRuleLite);
                  setEditingGate(false);
                }}
                onCancel={() => setEditingGate(false)}
              />
            </div>
          ) : null}
        </div>

        <Separator />

        {/* Tasks list */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Tasks (required for entry)</p>
              <p className="text-[11px] text-zinc-500">
                User must satisfy <strong>every</strong> task to enter the
                drawing. Drag-free reorder via the up/down arrows.
              </p>
            </div>
            {!taskEditing ? (
              <Button
                size="sm"
                onClick={() => setTaskEditing({ mode: "new" })}
                disabled={busy}
              >
                + Add task
              </Button>
            ) : null}
          </div>

          <div className="mt-3 space-y-2">
            {tasks.length === 0 ? (
              <p className="rounded-md border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-500 dark:border-zinc-700">
                No tasks yet. Add at least one before saving.
              </p>
            ) : (
              tasks.map((task, i) => (
                <div
                  key={`${task.id}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-800"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-500">#{i + 1}</span>
                      <span className="font-mono text-sm">{task.id}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {task.type}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-zinc-500">
                      {task.reward}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => moveTask(i, -1)}
                      disabled={busy || i === 0}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => moveTask(i, 1)}
                      disabled={busy || i === tasks.length - 1}
                    >
                      ↓
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTaskEditing({ mode: "edit", index: i })}
                      disabled={busy}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeTask(i)}
                      disabled={busy}
                      className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {taskEditing ? (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-white p-3 dark:border-amber-400/30 dark:bg-zinc-950">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                {taskEditing.mode === "edit"
                  ? `Editing task #${taskEditing.index + 1}`
                  : "New task"}
              </p>
              <RuleBuilderForm
                initial={
                  taskEditing.mode === "edit"
                    ? ruleToBuilt(tasks[taskEditing.index])
                    : undefined
                }
                busy={busy}
                onSubmit={(rule) => upsertTask(rule)}
                onCancel={() => setTaskEditing(null)}
              />
            </div>
          ) : null}
        </div>

        <Separator />

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {isEdit ? "Save changes" : "Create hunt"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default TreasureHuntsAdmin;
