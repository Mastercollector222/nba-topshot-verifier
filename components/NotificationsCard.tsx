"use client";

/**
 * components/NotificationsCard.tsx
 * ---------------------------------------------------------------------------
 * Self-contained "Get notified about new challenges" tile. Drop-in usable
 * on any signed-in page (e.g. /notifications, /rewards, profile edit
 * modal). Renders three states:
 *
 *   1. No email yet            → input + "Send confirmation" button
 *   2. Pending verification    → message "Check your inbox" + resend
 *   3. Verified                → toggle, change email, unsubscribe
 *
 * Communicates exclusively with /api/me/email/* endpoints. Tolerant of
 * the dev case where RESEND_API_KEY isn't set: the backend returns
 * { devSkipped: true } and we surface that.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import { toast } from "@/components/Toaster";

interface Prefs {
  email: string | null;
  verifiedAt: string | null;
  notificationsEnabled: boolean;
  hasUnsubscribeToken: boolean;
  pendingEmail: string | null;
  pendingExpiresAt: string | null;
}

export function NotificationsCard({ compact = false }: { compact?: boolean }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [editing, setEditing] = useState(false);

  const reload = () => {
    setLoading(true);
    return fetch("/api/me/email/preferences", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Prefs | null) => {
        setPrefs(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    void reload();
  }, []);

  async function submitSubscribe(email: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/me/email/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        devSkipped?: boolean;
      };
      if (!res.ok) {
        toast(data.error ?? `HTTP ${res.status}`, "error");
        return;
      }
      toast(
        data.devSkipped
          ? "Verification recorded (RESEND_API_KEY not configured — no email sent)"
          : "Confirmation email sent — check your inbox!",
        "success",
      );
      setEmailInput("");
      setEditing(false);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function patch(p: { notificationsEnabled?: boolean; clearEmail?: boolean }) {
    setSaving(true);
    try {
      const res = await fetch("/api/me/email/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(p),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast(data.error ?? "Update failed", "error");
        return;
      }
      await reload();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="motion-safe:animate-pulse h-32 rounded-2xl bg-white/[0.03]" />;
  }
  if (!prefs) return null;

  const verified = !!prefs.verifiedAt && !!prefs.email;
  const pending = !verified && !!prefs.pendingEmail;

  return (
    <section
      className={
        compact
          ? "rounded-xl border border-white/10 bg-white/[0.02] p-4"
          : "overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-orange-500/[0.06] via-amber-500/[0.04] to-transparent"
      }
    >
      {!compact && (
        <div className="border-b border-white/5 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300">
            Email alerts
          </p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-100">
            New challenge notifications
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            Get an email the moment a new challenge goes live, so you can grab
            the missing Moments before someone else does.
          </p>
        </div>
      )}

      <div className={compact ? "" : "p-5"}>
        {compact && (
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Email alerts
          </p>
        )}

        {/* State A: no email + not editing */}
        {!verified && !pending && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-orange-400"
          >
            <span aria-hidden>📬</span>
            Get notified about new challenges
          </button>
        )}

        {/* State A active: form */}
        {(editing || (!verified && !pending && false)) && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (emailInput.trim()) void submitSubscribe(emailInput.trim());
            }}
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <input
              type="email"
              required
              autoFocus
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="you@example.com"
              disabled={saving}
              className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-orange-400/50 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving || !emailInput.trim()}
                className="inline-flex items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-orange-400 disabled:opacity-50"
              >
                {saving ? "Sending…" : "Send confirmation"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setEmailInput("");
                }}
                disabled={saving}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* State B: pending verification */}
        {!verified && pending && (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
            <p className="text-sm font-medium text-amber-200">
              📨 Check your inbox at{" "}
              <span className="font-mono">{prefs.pendingEmail}</span>
            </p>
            <p className="mt-1 text-xs text-amber-200/70">
              Click the confirmation link to start receiving challenge alerts.
              The link expires in 1 hour.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => prefs.pendingEmail && void submitSubscribe(prefs.pendingEmail)}
                disabled={saving}
                className="rounded-full border border-amber-300/40 bg-transparent px-3 py-1.5 text-[11px] font-semibold text-amber-200 transition hover:bg-amber-300/10"
              >
                Resend
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setEmailInput(prefs.pendingEmail ?? "");
                }}
                disabled={saving}
                className="rounded-full border border-white/10 bg-transparent px-3 py-1.5 text-[11px] text-zinc-300 transition hover:border-white/20"
              >
                Use a different email
              </button>
            </div>
          </div>
        )}

        {/* State C: verified */}
        {verified && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  ✓ Verified
                </p>
                <p className="mt-0.5 truncate font-mono text-sm text-zinc-100">
                  {prefs.email}
                </p>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={prefs.notificationsEnabled}
                  disabled={saving}
                  onChange={(e) =>
                    void patch({ notificationsEnabled: e.target.checked })
                  }
                  className="h-4 w-4 accent-orange-500"
                />
                Notifications {prefs.notificationsEnabled ? "on" : "off"}
              </label>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setEmailInput(prefs.email ?? "");
                }}
                disabled={saving}
                className="rounded-full border border-white/10 px-3 py-1.5 text-zinc-300 hover:border-white/20"
              >
                Change email
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Remove this email? You'll stop getting challenge alerts.")) {
                    void patch({ clearEmail: true });
                  }
                }}
                disabled={saving}
                className="rounded-full border border-red-400/20 px-3 py-1.5 text-red-300 hover:bg-red-400/10"
              >
                Remove email
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default NotificationsCard;
