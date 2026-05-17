"use client";

/**
 * app/admin/page.tsx — Overview dashboard
 * ---------------------------------------------------------------------------
 * 6 stat tiles fetched in parallel, each linking to its sub-page.
 * Recent activity feed (latest 10 admin_actions) beneath.
 * Admin check is handled by app/admin/layout.tsx — no redundant gate here.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Shared helpers (duplicated from activity page to avoid coupling)
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

interface RecentAction {
  id: number;
  actor_address: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  note: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Stat tile
// ---------------------------------------------------------------------------

interface TileProps {
  label: string;
  value: number | null;
  href: string;
  accent: string;
  icon: string;
  description?: string;
}

function StatTile({ label, value, href, accent, icon, description }: TileProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-5 transition hover:border-white/10 hover:bg-white/[0.04]"
    >
      <div className="flex items-center justify-between">
        <span className="text-xl">{icon}</span>
        <span className={`text-2xl font-bold tabular-nums ${accent}`}>
          {value === null ? (
            <span className="inline-block h-6 w-12 animate-pulse rounded bg-white/10" />
          ) : (
            value.toLocaleString()
          )}
        </span>
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-200 group-hover:text-white">{label}</p>
        {description && <p className="mt-0.5 text-[11px] text-zinc-500">{description}</p>}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Stats fetcher
// ---------------------------------------------------------------------------

interface Stats {
  pendingClaims: number | null;
  unshippedPhysical: number | null;
  pendingMilestones: number | null;
  activeRules: number | null;
  openTreasureHunts: number | null;
  newUsers7d: number | null;
}

async function fetchStat(url: string): Promise<number> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return 0;
  const data = (await res.json()) as Record<string, unknown>;
  // Accept total, count, or array length
  if (typeof data.total === "number") return data.total;
  if (typeof data.count === "number") return data.count;
  if (Array.isArray(data.claims)) return (data as { claims: unknown[] }).claims.length;
  if (Array.isArray(data.hunts)) return (data as { hunts: unknown[] }).hunts.filter((h: unknown) => (h as { enabled?: boolean }).enabled).length;
  return 0;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminOverviewPage() {
  const [recentActions, setRecentActions] = useState<RecentAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    pendingClaims: null,
    unshippedPhysical: null,
    pendingMilestones: null,
    activeRules: null,
    openTreasureHunts: null,
    newUsers7d: null,
  });

  useEffect(() => {
    const run = async () => {
      // Fire all independent fetches in parallel
      const [
        pendingClaimsTotal,
        queuedPhysical,
        packedPhysical,
        rulesData,
        huntsData,
        milestonesData,
        newUsers7d,
      ] = await Promise.all([
        fetchStat("/api/admin/claims?status=pending&pageSize=1"),
        fetchStat("/api/admin/fulfillment?status=queued&page=1"),
        fetchStat("/api/admin/fulfillment?status=packed&page=1"),
        fetch("/api/admin/rules", { cache: "no-store" })
          .then((r) => r.ok ? r.json() as Promise<{ rules: { enabled: boolean }[] }> : { rules: [] }),
        fetch("/api/admin/treasure-hunts", { cache: "no-store" })
          .then((r) => r.ok ? r.json() as Promise<{ hunts: { enabled: boolean }[] }> : { hunts: [] }),
        fetch("/api/admin/milestone-claims?pageSize=200", { cache: "no-store" })
          .then((r) => r.ok ? r.json() as Promise<{ claims: { status: string }[] }> : { claims: [] }),
        fetchStat("/api/admin/stats/new-users?days=7"),
      ]);

      const enabledCount = rulesData.rules.filter((r) => r.enabled).length;
      const openHunts = huntsData.hunts.filter((h) => h.enabled).length;
      const pendingMs = milestonesData.claims.filter((c) => c.status === "pending").length;

      setStats({
        pendingClaims: pendingClaimsTotal,
        unshippedPhysical: queuedPhysical + packedPhysical,
        pendingMilestones: pendingMs,
        activeRules: enabledCount,
        openTreasureHunts: openHunts,
        newUsers7d,
      });
    };
    void run();

    // Fetch recent activity independently
    setActionsLoading(true);
    void fetch("/api/admin/activity?limit=10", { cache: "no-store" })
      .then((r) => r.ok ? r.json() as Promise<{ actions: RecentAction[] }> : { actions: [] })
      .then((d) => setRecentActions(d.actions))
      .finally(() => setActionsLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Overview</h1>
        <p className="mt-1 text-sm text-zinc-500">At-a-glance site health. Click any tile to manage.</p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="Pending Claims"
          value={stats.pendingClaims}
          href="/admin/claims?status=pending"
          accent="text-amber-400"
          icon="🎁"
          description="Awaiting airdrop"
        />
        <StatTile
          label="Unshipped Physical"
          value={stats.unshippedPhysical}
          href="/admin/fulfillment"
          accent="text-orange-400"
          icon="📦"
          description="Queued + packed"
        />
        <StatTile
          label="Pending Milestones"
          value={stats.pendingMilestones}
          href="/admin/milestones"
          accent="text-yellow-400"
          icon="🏆"
          description="TSR milestone claims"
        />
        <StatTile
          label="Active Rules"
          value={stats.activeRules}
          href="/admin/rules"
          accent="text-emerald-400"
          icon="📋"
          description="Enabled reward rules"
        />
        <StatTile
          label="Treasure Hunts Open"
          value={stats.openTreasureHunts}
          href="/admin/treasure-hunts"
          accent="text-cyan-400"
          icon="🗺️"
          description="Currently enabled"
        />
        <StatTile
          label="New Users (7d)"
          value={stats.newUsers7d}
          href="/admin/tsr"
          accent="text-violet-400"
          icon="👤"
          description="Completed onboarding"
        />
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest 10 admin mutations</CardDescription>
          </div>
          <Link
            href="/admin/activity"
            className="text-xs text-zinc-500 transition hover:text-orange-400"
          >
            View all →
          </Link>
        </CardHeader>
        <CardContent>
          {actionsLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-white/[0.04]" />
              ))}
            </div>
          ) : recentActions.length === 0 ? (
            <p className="text-sm text-zinc-600">No actions recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {recentActions.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      ACTION_COLORS[row.action] ?? "bg-zinc-700/40 text-zinc-400"
                    }`}
                  >
                    {ACTION_LABELS[row.action] ?? row.action}
                  </span>
                  {row.target_id && (
                    <span className="font-mono text-xs text-zinc-500">{row.target_id}</span>
                  )}
                  <span className="ml-auto text-xs text-zinc-600">
                    {shortAddr(row.actor_address)} · {timeAgo(row.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
