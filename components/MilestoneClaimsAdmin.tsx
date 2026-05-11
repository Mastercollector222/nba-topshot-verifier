"use client";

/**
 * components/MilestoneClaimsAdmin.tsx
 * ---------------------------------------------------------------------------
 * Admin table showing all TSR milestone claims across all users.
 * Supports pagination and marking claims as fulfilled / pending.
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
import { Badge } from "@/components/ui/badge";

function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [value]);
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied!" : `Copy ${value}`}
      className={
        "ml-1 inline-flex shrink-0 items-center rounded p-0.5 transition " +
        (copied
          ? "text-emerald-400"
          : "text-zinc-500 hover:text-zinc-200") +
        (className ? ` ${className}` : "")
      }
    >
      {copied ? (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

interface MilestoneMeta {
  threshold: number;
  reward_label: string;
  bonus_tsr: number;
}

interface MilestoneClaim {
  id: string;
  flow_address: string;
  topshot_username: string;
  status: "pending" | "fulfilled";
  claimed_at: string;
  milestone_id: string;
  tsr_milestones: MilestoneMeta | null;
}

interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const PAGE_SIZE = 50;

export function MilestoneClaimsAdmin() {
  const [claims, setClaims] = useState<MilestoneClaim[]>([]);
  const [meta, setMeta] = useState<PageMeta>({
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/milestone-claims?page=${p}&pageSize=${PAGE_SIZE}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const body = (await res.json()) as { claims: MilestoneClaim[] } & PageMeta;
        setClaims(body.claims);
        setMeta({
          total: body.total,
          page: body.page,
          pageSize: body.pageSize,
          totalPages: body.totalPages,
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const toggle = useCallback(
    async (claim: MilestoneClaim) => {
      setBusy(claim.id);
      const next = claim.status === "pending" ? "fulfilled" : "pending";
      try {
        await fetch("/api/admin/milestone-claims", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: claim.id, status: next }),
        });
        await load(page);
      } finally {
        setBusy(null);
      }
    },
    [load, page],
  );

  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Milestone Claims</CardTitle>
        <CardDescription>
          All TSR milestone rewards claimed by users. Mark as{" "}
          <span className="font-semibold text-emerald-500">Fulfilled</span> once
          the reward has been sent.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading ? (
          <p className="py-6 text-center text-sm text-zinc-500">Loading…</p>
        ) : claims.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">
            No milestone claims yet.
          </p>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden grid-cols-[1fr_1fr_1.4fr_0.7fr_0.9fr_auto] gap-3 border-b border-zinc-800 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 md:grid">
              <span>Flow Address</span>
              <span>Top Shot Username</span>
              <span>Milestone</span>
              <span>Bonus TSR</span>
              <span>Claimed At</span>
              <span />
            </div>

            {claims.map((c) => {
              const ms = c.tsr_milestones;
              return (
                <div
                  key={c.id}
                  className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 md:grid-cols-[1fr_1fr_1.4fr_0.7fr_0.9fr_auto] md:items-center md:gap-3 md:rounded-none md:border-0 md:border-b md:bg-transparent md:p-1.5"
                >
                  {/* Flow address */}
                  <div className="flex min-w-0 items-center gap-0.5">
                    <span className="truncate font-mono text-xs text-zinc-300">
                      {c.flow_address}
                    </span>
                    <CopyButton value={c.flow_address} />
                  </div>

                  {/* Top Shot username */}
                  <div className="flex min-w-0 items-center gap-0.5">
                    {c.topshot_username ? (
                      <>
                        <span className="truncate text-sm font-medium">
                          {c.topshot_username}
                        </span>
                        <CopyButton value={c.topshot_username} />
                      </>
                    ) : (
                      <span className="italic text-zinc-500">—</span>
                    )}
                  </div>

                  {/* Milestone label */}
                  <div className="min-w-0">
                    {ms ? (
                      <>
                        <p className="truncate text-sm font-medium">
                          {ms.reward_label}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {ms.threshold.toLocaleString()} TSR threshold
                        </p>
                      </>
                    ) : (
                      <span className="italic text-zinc-500 text-xs">
                        Milestone deleted
                      </span>
                    )}
                  </div>

                  {/* Bonus TSR */}
                  <span className="text-sm text-amber-300">
                    {ms?.bonus_tsr ? `+${ms.bonus_tsr.toLocaleString()}` : "—"}
                  </span>

                  {/* Claimed at */}
                  <span className="text-xs text-zinc-400">
                    {new Date(c.claimed_at).toLocaleString()}
                  </span>

                  {/* Status + action */}
                  <div className="flex items-center gap-2">
                    {c.status === "fulfilled" ? (
                      <Badge className="bg-emerald-500/15 text-emerald-400 text-[10px]">
                        Fulfilled
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="text-[10px] text-amber-300 border-amber-400/30 bg-amber-400/10"
                      >
                        Pending
                      </Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      disabled={busy === c.id}
                      onClick={() => toggle(c)}
                    >
                      {c.status === "pending" ? "Mark Fulfilled" : "Reopen"}
                    </Button>
                  </div>
                </div>
              );
            })}

            {/* Pagination */}
            <div className="flex items-center justify-between pt-2 text-xs text-zinc-400">
              <span>
                {meta.total > 0
                  ? `Showing ${from}–${to} of ${meta.total.toLocaleString()}`
                  : "No claims"}
              </span>
              <div className="flex items-center gap-2">
                <span>
                  Page {meta.page} of {meta.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= meta.totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
