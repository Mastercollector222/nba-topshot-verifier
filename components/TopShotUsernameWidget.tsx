"use client";

/**
 * TopShotUsernameWidget
 * ---------------------------------------------------------------------------
 * Compact dashboard control that lets the signed-in user attach (and verify)
 * their Top Shot username to the connected Flow wallet.
 *
 * Three render states:
 *   - **Loading**: lightweight skeleton while we fetch the current value.
 *   - **Set**: shows `@<username>` as an amber badge with an Edit button.
 *   - **Unset / Editing**: text input + Save button. On save we POST to
 *     `/api/me/topshot-username`; the server verifies the username really
 *     belongs to the connected Flow address by querying Top Shot's public
 *     GraphQL. Any mismatch produces a clean inline error.
 *
 * Once saved, the username appears on the public leaderboard, the admin
 * console, and anywhere else display names are surfaced.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface State {
  username: string | null;
  setAt: string | null;
}

export function TopShotUsernameWidget() {
  const [state, setState] = useState<State | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial load. 401s are expected if the user happens to be signed out
  // — the widget just hides itself in that case.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/topshot-username", {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setState({ username: null, setAt: null });
          return;
        }
        const body = (await res.json()) as State;
        if (!cancelled) {
          setState(body);
          setDraft(body.username ?? "");
        }
      } catch {
        if (!cancelled) setState({ username: null, setAt: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setError(null);
    const username = draft.trim();
    if (!username) {
      setError("Enter your Top Shot username.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/me/topshot-username", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const body = (await res.json()) as {
        username?: string;
        setAt?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setState({
        username: body.username ?? username,
        setAt: body.setAt ?? new Date().toISOString(),
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!confirm("Unlink your Top Shot username from this wallet?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/topshot-username", { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setState({ username: null, setAt: null });
      setDraft("");
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (state === null) {
    // Tiny skeleton — keeps the layout stable while we fetch.
    return (
      <div className="h-7 w-40 animate-pulse rounded-full bg-white/5" />
    );
  }

  // Display mode — username attached, not currently editing.
  if (state.username && !editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span
          title={
            state.setAt
              ? `Linked ${new Date(state.setAt).toLocaleString()} · verified against Top Shot`
              : "Verified against Top Shot"
          }
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200"
        >
          {/* Inline checkmark badge — visual cue that the link is verified. */}
          <svg
            viewBox="0 0 16 16"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M3 8.5l3 3 7-7" />
          </svg>
          @{state.username}
        </span>
        <button
          type="button"
          onClick={() => {
            setEditing(true);
            setDraft(state.username ?? "");
            setError(null);
          }}
          className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 transition hover:text-orange-300"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={unlink}
          disabled={busy}
          className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 transition hover:text-red-400 disabled:opacity-50"
        >
          Unlink
        </button>
      </div>
    );
  }

  // Edit / first-time-link mode.
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Top Shot username"
        autoFocus
        disabled={busy}
        // Slightly tighter than the default Input — fits inline next to
        // the wallet badge in the dashboard hero.
        className="h-9 w-48 text-sm"
      />
      <Button
        type="submit"
        disabled={busy || !draft.trim()}
        className="h-9 rounded-full border-0 bg-gradient-to-r from-orange-500 to-red-500 px-4 text-xs font-semibold text-black shadow-[0_8px_24px_-8px_rgba(251,113,38,0.7)] hover:brightness-110"
      >
        {busy ? "Verifying…" : state.username ? "Update" : "Link"}
      </Button>
      {state.username || editing ? (
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError(null);
            setDraft(state.username ?? "");
          }}
          disabled={busy}
          className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 transition hover:text-zinc-200"
        >
          Cancel
        </button>
      ) : null}
      {error ? (
        <span className="basis-full text-[11px] text-red-400">{error}</span>
      ) : !state.username ? (
        <span className="basis-full text-[11px] text-zinc-500">
          We&apos;ll verify it against your connected wallet.
        </span>
      ) : null}
    </form>
  );
}
