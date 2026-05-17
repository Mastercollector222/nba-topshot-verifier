"use client";

/**
 * app/admin/activity/page.tsx
 * ---------------------------------------------------------------------------
 * Reverse-chronological paginated view of admin_actions audit log.
 * Filter by action type or actor address. Each row has a "Details" toggle
 * showing before/after JSON diff in a <pre>.
 * ---------------------------------------------------------------------------
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminAction {
  id: number;
  actor_address: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
}

interface ApiResponse {
  actions: AdminAction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  "claim.status_change":     "Claim status changed",
  "claim.shipping_update":   "Claim shipping updated",
  "rule.create":             "Rule created",
  "rule.update":             "Rule updated",
  "rule.delete":             "Rule deleted",
  "rule.notify":             "Rule notification sent",
  "tsr.adjust":              "TSR adjustment",
  "milestone.fulfill":       "Milestone fulfilled",
  "stack_challenge.create":  "Stack challenge created",
  "stack_challenge.update":  "Stack challenge updated",
  "stack_challenge.delete":  "Stack challenge deleted",
  "stack_challenge.settle":  "Stack challenge settled",
};

const ACTION_COLORS: Record<string, string> = {
  "claim.status_change":     "bg-amber-500/15 text-amber-300",
  "claim.shipping_update":   "bg-orange-500/15 text-orange-300",
  "rule.create":             "bg-emerald-500/15 text-emerald-300",
  "rule.update":             "bg-blue-500/15 text-blue-300",
  "rule.delete":             "bg-red-500/15 text-red-300",
  "rule.notify":             "bg-purple-500/15 text-purple-300",
  "tsr.adjust":              "bg-cyan-500/15 text-cyan-300",
  "milestone.fulfill":       "bg-teal-500/15 text-teal-300",
  "stack_challenge.create":  "bg-fuchsia-500/15 text-fuchsia-300",
  "stack_challenge.update":  "bg-indigo-500/15 text-indigo-300",
  "stack_challenge.delete":  "bg-red-500/15 text-red-300",
  "stack_challenge.settle":  "bg-yellow-500/15 text-yellow-300",
};

const ALL_ACTIONS = Object.keys(ACTION_LABELS);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

function ActionRow({ row, viewerAddress }: { row: AdminAction; viewerAddress: string }) {
  const [open, setOpen] = useState(false);
  const isYou = row.actor_address === viewerAddress;
  const label = ACTION_LABELS[row.action] ?? row.action;
  const colorClass = ACTION_COLORS[row.action] ?? "bg-zinc-700/40 text-zinc-400";
  const hasDiff = row.before_data !== null || row.after_data !== null;

  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {/* Action badge */}
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${colorClass}`}>
          {label}
        </span>

        {/* Target */}
        {row.target_id && (
          <span className="font-mono text-xs text-zinc-400">
            {row.target_type ? `${row.target_type}: ` : ""}
            <span className="text-zinc-300">{row.target_id}</span>
          </span>
        )}

        {/* Note */}
        {row.note && (
          <span className="italic text-xs text-zinc-500">"{row.note}"</span>
        )}

        <span className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
          {/* Actor */}
          <span className={isYou ? "text-orange-400" : "text-zinc-400"}>
            {isYou ? "You" : shortAddr(row.actor_address)}
          </span>
          <span>·</span>
          <span title={new Date(row.created_at).toLocaleString()}>{timeAgo(row.created_at)}</span>

          {/* Details toggle */}
          {hasDiff && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="rounded border border-white/10 px-2 py-0.5 text-[11px] transition hover:bg-white/5"
            >
              {open ? "Hide" : "Details"}
            </button>
          )}
        </span>
      </div>

      {/* Before / after diff */}
      {open && hasDiff && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {row.before_data !== null && (
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-zinc-600">Before</p>
              <pre className="overflow-x-auto rounded-md bg-white/[0.03] p-3 text-[11px] text-zinc-400">
                {JSON.stringify(row.before_data, null, 2)}
              </pre>
            </div>
          )}
          {row.after_data !== null && (
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-zinc-600">After</p>
              <pre className="overflow-x-auto rounded-md bg-white/[0.03] p-3 text-[11px] text-zinc-400">
                {JSON.stringify(row.after_data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner (uses useSearchParams)
// ---------------------------------------------------------------------------

function ActivityInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const page        = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const actionFilter = searchParams.get("action") ?? "";
  const actorFilter  = searchParams.get("actor") ?? "";

  const [data, setData]               = useState<ApiResponse | null>(null);
  const [loading, setLoading]         = useState(true);
  const [viewerAddress, setViewer]    = useState("");

  // Fetch viewer address
  useEffect(() => {
    void fetch("/api/admin/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { address?: string }) => { if (d.address) setViewer(d.address); });
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (actionFilter) params.set("action", actionFilter);
    if (actorFilter)  params.set("actor", actorFilter);

    void fetch(`/api/admin/activity?${params.toString()}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() as Promise<ApiResponse> : null)
      .then((d) => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, [page, actionFilter, actorFilter]);

  const push = (updates: Record<string, string>) => {
    const p = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v) p.set(k, v); else p.delete(k);
    });
    p.delete("page");
    router.replace(`/admin/activity?${p.toString()}`);
  };

  const setPage = (n: number) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("page", String(n));
    router.replace(`/admin/activity?${p.toString()}`);
  };

  const hasFilters = !!(actionFilter || actorFilter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Activity Log</h1>
        <p className="mt-1 text-sm text-zinc-500">Every admin mutation, newest first.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={actionFilter}
          onChange={(e) => push({ action: e.target.value })}
          className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-200 focus:outline-none"
        >
          <option value="">All actions</option>
          {ALL_ACTIONS.map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a]}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Filter by actor address…"
          value={actorFilter}
          onChange={(e) => push({ actor: e.target.value })}
          className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
        />

        {hasFilters && (
          <button
            type="button"
            onClick={() => push({ action: "", actor: "" })}
            className="text-xs text-zinc-500 underline hover:text-zinc-200"
          >
            Reset
          </button>
        )}

        {data && (
          <span className="ml-auto text-xs text-zinc-600">
            {data.total.toLocaleString()} total
          </span>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-white/[0.04]" />
          ))}
        </div>
      ) : !data || data.actions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-zinc-500">
            No activity yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.actions.map((row) => (
            <ActionRow key={row.id} row={row} viewerAddress={viewerAddress} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            Page <span className="font-mono text-zinc-200">{data.page}</span> of{" "}
            <span className="font-mono text-zinc-200">{data.totalPages}</span>
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage(page - 1)}
              className="rounded-lg border border-white/10 px-3 py-1.5 transition hover:bg-white/5 disabled:opacity-40"
            >
              ‹ Prev
            </button>
            <button
              type="button"
              disabled={page >= data.totalPages || loading}
              onClick={() => setPage(page + 1)}
              className="rounded-lg border border-white/10 px-3 py-1.5 transition hover:bg-white/5 disabled:opacity-40"
            >
              Next ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page shell with Suspense boundary
// ---------------------------------------------------------------------------

export default function ActivityPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Activity Log</h1>
          <p className="mt-1 text-sm text-zinc-500">Every admin mutation, newest first.</p>
        </div>
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-white/[0.04]" />
          ))}
        </div>
      </div>
    }>
      <ActivityInner />
    </Suspense>
  );
}
