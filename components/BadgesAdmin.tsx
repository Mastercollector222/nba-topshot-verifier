"use client";

/**
 * components/BadgesAdmin.tsx
 * ---------------------------------------------------------------------------
 * Admin CRUD for the achievement-badge catalog.
 *
 *   - List existing badges
 *   - Create / update via inline form (slug-style id; reusing an id
 *     overwrites the row)
 *   - Delete (cascades into user_badges via FK)
 *   - Manual award/revoke to a Flow address
 *
 * Auto-award criteria are CSV-style text inputs (rule ids and hunt ids).
 * That's intentional: admins already know these slugs from the rules /
 * hunts lists above this component, and a free-text input keeps this
 * UI from needing fancy multi-select widgets.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";

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
import { Badge as BadgeChip } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface BadgeDto {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  autoRuleIds: string[];
  autoHuntIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  autoRuleIds: string;
  autoHuntIds: string;
}

const blank = (): FormState => ({
  id: "",
  name: "",
  description: "",
  imageUrl: "",
  autoRuleIds: "",
  autoHuntIds: "",
});

function fromDto(b: BadgeDto): FormState {
  return {
    id: b.id,
    name: b.name,
    description: b.description ?? "",
    imageUrl: b.imageUrl ?? "",
    autoRuleIds: b.autoRuleIds.join(", "),
    autoHuntIds: b.autoHuntIds.join(", "),
  };
}

function csv(s: string): string[] {
  return s
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function BadgesAdmin() {
  const [badges, setBadges] = useState<BadgeDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [message, setMessage] = useState<{
    kind: "info" | "error";
    text: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/badges", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { badges: BadgeDto[] };
      setBadges(body.badges);
    } catch {
      /* tolerated */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async () => {
    if (!editing) return;
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/badges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editing.id.trim(),
          name: editing.name.trim(),
          description: editing.description.trim() || undefined,
          imageUrl: editing.imageUrl.trim() || undefined,
          autoRuleIds: csv(editing.autoRuleIds),
          autoHuntIds: csv(editing.autoHuntIds),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage({ kind: "error", text: body.error ?? `HTTP ${res.status}` });
        return;
      }
      setMessage({ kind: "info", text: `Saved badge "${editing.id}".` });
      setEditing(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [editing, refresh]);

  const remove = useCallback(
    async (id: string) => {
      if (!confirm(`Delete badge "${id}"? Cascades into user awards.`)) return;
      setBusy(true);
      try {
        await fetch(`/api/admin/badges/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  // Manual award/revoke — small inline form per badge row.
  const grant = useCallback(
    async (badgeId: string, action: "POST" | "DELETE", flowAddress: string) => {
      const addr = flowAddress.trim().toLowerCase();
      if (!/^0x[0-9a-f]{16}$/.test(addr)) {
        setMessage({ kind: "error", text: "Address must be 0x + 16 hex." });
        return;
      }
      setBusy(true);
      try {
        const res = await fetch("/api/admin/badges/award", {
          method: action,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ flowAddress: addr, badgeId }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setMessage({
            kind: "error",
            text: body.error ?? `HTTP ${res.status}`,
          });
          return;
        }
        setMessage({
          kind: "info",
          text:
            action === "POST"
              ? `Granted "${badgeId}" to ${addr}.`
              : `Revoked "${badgeId}" from ${addr}.`,
        });
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Badges</CardTitle>
          <CardDescription className="mt-1">
            Achievements shown on user profile pages. Auto-awarded when a
            user completes any listed rule or hunt; admin can also award
            them manually.
          </CardDescription>
        </div>
        {!editing ? (
          <Button onClick={() => setEditing(blank())} disabled={busy}>
            + New badge
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {badges.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No badges yet. Click <strong>New badge</strong> to create one.
          </p>
        ) : (
          <div className="space-y-2">
            {badges.map((b) => (
              <BadgeRow
                key={b.id}
                badge={b}
                busy={busy}
                onEdit={() => setEditing(fromDto(b))}
                onDelete={() => remove(b.id)}
                onGrant={(addr) => grant(b.id, "POST", addr)}
                onRevoke={(addr) => grant(b.id, "DELETE", addr)}
              />
            ))}
          </div>
        )}

        {editing ? (
          <>
            <Separator />
            <div className="grid gap-3 rounded-md border border-amber-500/40 bg-amber-50/30 p-4 dark:border-amber-400/30 dark:bg-amber-950/20 md:grid-cols-2">
              <div>
                <Label htmlFor="b-id">Slug *</Label>
                <Input
                  id="b-id"
                  placeholder="e.g. triple-threat"
                  value={editing.id}
                  onChange={(e) =>
                    setEditing({ ...editing, id: e.target.value })
                  }
                  disabled={busy}
                />
                <p className="mt-1 text-[10px] text-zinc-500">
                  Reusing a slug overwrites that badge.
                </p>
              </div>
              <div>
                <Label htmlFor="b-name">Name *</Label>
                <Input
                  id="b-name"
                  placeholder="e.g. Triple Threat"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  disabled={busy}
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="b-desc">Description</Label>
                <Input
                  id="b-desc"
                  placeholder="One-line tagline shown on the profile"
                  value={editing.description}
                  onChange={(e) =>
                    setEditing({ ...editing, description: e.target.value })
                  }
                  disabled={busy}
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="b-img">Image URL</Label>
                <Input
                  id="b-img"
                  type="url"
                  placeholder="https://…/badge.png"
                  value={editing.imageUrl}
                  onChange={(e) =>
                    setEditing({ ...editing, imageUrl: e.target.value })
                  }
                  disabled={busy}
                />
              </div>
              <div>
                <Label htmlFor="b-rules">Auto-award rule IDs</Label>
                <Input
                  id="b-rules"
                  placeholder="rule-a, rule-b"
                  value={editing.autoRuleIds}
                  onChange={(e) =>
                    setEditing({ ...editing, autoRuleIds: e.target.value })
                  }
                  disabled={busy}
                />
                <p className="mt-1 text-[10px] text-zinc-500">
                  Earning ANY of these rules auto-awards the badge.
                </p>
              </div>
              <div>
                <Label htmlFor="b-hunts">Auto-award hunt IDs</Label>
                <Input
                  id="b-hunts"
                  placeholder="spring-2026, summer-2026"
                  value={editing.autoHuntIds}
                  onChange={(e) =>
                    setEditing({ ...editing, autoHuntIds: e.target.value })
                  }
                  disabled={busy}
                />
                <p className="mt-1 text-[10px] text-zinc-500">
                  Entering ANY of these hunts auto-awards the badge.
                </p>
              </div>
              <div className="md:col-span-2 flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditing(null)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button onClick={save} disabled={busy}>
                  Save badge
                </Button>
              </div>
            </div>
          </>
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
      </CardContent>
    </Card>
  );
}

function BadgeRow({
  badge,
  busy,
  onEdit,
  onDelete,
  onGrant,
  onRevoke,
}: {
  badge: BadgeDto;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onGrant: (addr: string) => void;
  onRevoke: (addr: string) => void;
}) {
  const [addr, setAddr] = useState("");
  return (
    <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {badge.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={badge.imageUrl}
              alt={badge.name}
              className="h-10 w-10 rounded border border-zinc-200 bg-zinc-50 object-cover dark:border-zinc-700"
              loading="lazy"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-xs text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900">
              ?
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm">{badge.id}</span>
              <span className="text-sm font-medium">· {badge.name}</span>
              {badge.autoRuleIds.length > 0 ? (
                <BadgeChip variant="outline" className="text-[10px]">
                  {badge.autoRuleIds.length} rule
                  {badge.autoRuleIds.length === 1 ? "" : "s"}
                </BadgeChip>
              ) : null}
              {badge.autoHuntIds.length > 0 ? (
                <BadgeChip variant="outline" className="text-[10px]">
                  {badge.autoHuntIds.length} hunt
                  {badge.autoHuntIds.length === 1 ? "" : "s"}
                </BadgeChip>
              ) : null}
            </div>
            {badge.description ? (
              <p className="truncate text-xs text-zinc-500">
                {badge.description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onEdit} disabled={busy}>
            Edit
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          placeholder="0x... (Flow address to manually grant/revoke)"
          className="h-8 max-w-sm font-mono text-xs"
          disabled={busy}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => onGrant(addr)}
          disabled={busy || !addr.trim()}
        >
          Grant
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onRevoke(addr)}
          disabled={busy || !addr.trim()}
          className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          Revoke
        </Button>
      </div>
    </div>
  );
}

export default BadgesAdmin;

// ---------------------------------------------------------------------------
// UserProfileAdmin — clear avatar / bio per address
// ---------------------------------------------------------------------------

export function UserProfileAdmin() {
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "info" | "error";
    text: string;
  } | null>(null);

  async function act(action: "clear_avatar" | "clear_bio") {
    const a = addr.trim().toLowerCase();
    if (!/^0x[0-9a-f]{16}$/.test(a)) {
      setMessage({ kind: "error", text: "Address must be 0x + 16 hex." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, address: a }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage({ kind: "error", text: body.error ?? `HTTP ${res.status}` });
        return;
      }
      setMessage({
        kind: "info",
        text:
          action === "clear_avatar"
            ? `Avatar cleared for ${a}.`
            : `Bio cleared for ${a}.`,
      });
      setAddr("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Profile Moderation</CardTitle>
        <CardDescription>
          Clear a user&apos;s avatar or bio. Enter the full Flow address, then
          click the action.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="0x0123456789abcdef"
            className="h-9 max-w-xs font-mono text-sm"
            disabled={busy}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void act("clear_avatar")}
            disabled={busy || !addr.trim()}
            className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Clear avatar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void act("clear_bio")}
            disabled={busy || !addr.trim()}
            className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Clear bio
          </Button>
        </div>
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
      </CardContent>
    </Card>
  );
}
