"use client";

/**
 * app/admin/page.tsx — Overview dashboard
 * ---------------------------------------------------------------------------
 * 6 stat tiles fetched in parallel, each linking to its sub-page.
 * "Recent activity" placeholder beneath.
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

      {/* Recent activity placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Live admin event feed</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500">Coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
