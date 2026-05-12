"use client";

/**
 * components/AdminClaimsTable.tsx
 * ---------------------------------------------------------------------------
 * Admin-only view of user reward claims. Lets the admin mark a claim as
 * `sent` or `rejected` after airdropping (or declining) the prize.
 * Shows shipping address for physical rewards.
 * ---------------------------------------------------------------------------
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

const PAGE_SIZE = 50;

interface Claim {
  flow_address: string;
  rule_id: string;
  topshot_username: string;
  reward_label: string | null;
  reward_set_id: number | null;
  reward_play_id: number | null;
  status: "pending" | "sent" | "rejected";
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  ship_full_name: string | null;
  ship_address_line1: string | null;
  ship_address_line2: string | null;
  ship_city: string | null;
  ship_state: string | null;
  ship_postal_code: string | null;
  ship_country: string | null;
  ship_phone: string | null;
  ship_email: string | null;
  ship_notes: string | null;
  rule?: {
    is_physical: boolean;
    physical_title: string | null;
    physical_description: string | null;
    physical_image_url: string | null;
  };
}

interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function ClaimRow({ claim: c, busy, onUpdateStatus }: { claim: Claim; busy: boolean; onUpdateStatus: (c: Claim, status: Claim["status"]) => Promise<void> }) {
  const [showShipping, setShowShipping] = useState(false);
  const isPhysical = c.rule?.is_physical ?? false;

  const fullAddress = [
    c.ship_full_name,
    c.ship_address_line1,
    c.ship_address_line2,
    [c.ship_city, c.ship_state, c.ship_postal_code].filter(Boolean).join(", "),
    c.ship_country,
  ].filter(Boolean).join("\n");

  return (
    <>
      <tr className="border-b border-zinc-100 dark:border-zinc-900">
        <td className="py-2 pr-3 font-mono">
          {c.flow_address}
          <CopyButton value={c.flow_address} />
        </td>
        <td className="py-2 pr-3 font-mono">{c.rule_id}</td>
        <td className="py-2 pr-3">{c.reward_label ?? "—"}</td>
        <td className="py-2 pr-3 font-mono">
          {c.reward_set_id != null || c.reward_play_id != null
            ? `${c.reward_set_id ?? "?"} / ${c.reward_play_id ?? "?"}`
            : "—"}
        </td>
        <td className="py-2 pr-3 font-medium">
          {c.topshot_username}
          <CopyButton value={c.topshot_username} />
        </td>
        <td className="py-2 pr-3">
          <Badge
            variant="outline"
            className={
              c.status === "sent"
                ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                : c.status === "rejected"
                  ? "border-red-500/40 text-red-600 dark:text-red-300"
                  : "border-amber-500/40 text-amber-700 dark:text-amber-300"
            }
          >
            {c.status}
          </Badge>
        </td>
        <td className="py-2 pr-3">
          {isPhysical ? (
            <Badge variant="outline" className="border-purple-500/40 text-purple-600 dark:text-purple-300">
              PHYSICAL
            </Badge>
          ) : (
            <span className="text-zinc-500">Digital</span>
          )}
        </td>
        <td className="py-2 pr-3">
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || c.status === "sent"}
              onClick={() => onUpdateStatus(c, "sent")}
            >
              Mark sent
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || c.status === "rejected"}
              onClick={() => onUpdateStatus(c, "rejected")}
              className="text-red-600"
            >
              Reject
            </Button>
            {isPhysical && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowShipping((s) => !s)}
              >
                {showShipping ? "Hide" : "Shipping"}
              </Button>
            )}
          </div>
        </td>
      </tr>
      {showShipping && isPhysical && (
        <tr className="border-b border-zinc-100 dark:border-zinc-900 bg-white/[0.02]">
          <td colSpan={8} className="py-3 pr-3">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-zinc-500">Physical Item</p>
                <p className="font-medium text-zinc-200">{c.rule?.physical_title ?? "—"}</p>
                {c.rule?.physical_description && (
                  <p className="mt-1 text-zinc-400">{c.rule.physical_description}</p>
                )}
              </div>
              <div>
                <p className="text-zinc-500">Shipping Address</p>
                {c.ship_full_name ? (
                  <div className="mt-1 space-y-0.5 text-zinc-300">
                    <p className="flex items-center gap-1">
                      {c.ship_full_name}
                      <CopyButton value={c.ship_full_name ?? ""} />
                    </p>
                    <p className="flex items-center gap-1">
                      {c.ship_address_line1}
                      <CopyButton value={c.ship_address_line1 ?? ""} />
                    </p>
                    {c.ship_address_line2 && <p>{c.ship_address_line2}</p>}
                    <p>
                      {[c.ship_city, c.ship_state].filter(Boolean).join(", ")}
                      {" "}{c.ship_postal_code}
                    </p>
                    <p className="font-medium">{c.ship_country}</p>
                    {c.ship_phone && (
                      <p className="flex items-center gap-1 text-zinc-400">
                        📞 {c.ship_phone}
                        <CopyButton value={c.ship_phone} />
                      </p>
                    )}
                    {c.ship_email && (
                      <p className="flex items-center gap-1 text-zinc-400">
                        ✉️ {c.ship_email}
                        <CopyButton value={c.ship_email} />
                      </p>
                    )}
                    {c.ship_notes && (
                      <p className="mt-2 text-zinc-500 italic">Notes: {c.ship_notes}</p>
                    )}
                    <button
                      onClick={() => navigator.clipboard.writeText(fullAddress)}
                      className="mt-2 inline-flex items-center gap-1 text-[10px] text-zinc-500 transition hover:text-zinc-300"
                    >
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copy full address
                    </button>
                  </div>
                ) : (
                  <p className="text-amber-500">No shipping address provided</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function AdminClaimsTable() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [meta, setMeta] = useState<PageMeta>({ total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/claims?page=${p}&pageSize=${PAGE_SIZE}`, { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as { claims: Claim[] } & PageMeta;
        setClaims(body.claims);
        setMeta({ total: body.total, page: body.page, pageSize: body.pageSize, totalPages: body.totalPages });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const updateStatus = async (c: Claim, status: Claim["status"]) => {
    setBusy(true);
    try {
      await fetch("/api/admin/claims", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          flowAddress: c.flow_address,
          ruleId: c.rule_id,
          status,
        }),
      });
      await load(page);
    } finally {
      setBusy(false);
    }
  };

  const fromRow = (meta.page - 1) * meta.pageSize + 1;
  const toRow = Math.min(meta.page * meta.pageSize, meta.total);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reward claims</CardTitle>
        <CardDescription>
          Users who earned a reward and submitted their NBA Top Shot username.
          Mark <strong>sent</strong> once you&apos;ve airdropped the prize.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : claims.length === 0 && meta.total === 0 ? (
          <p className="text-sm text-zinc-500">No claims yet.</p>
        ) : (
          <>
            {/* Count + pager — top */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
              <span>
                Showing{" "}
                <span className="font-mono text-zinc-200">{fromRow}–{toRow}</span>
                {" "}of{" "}
                <span className="font-mono text-zinc-200">{meta.total}</span>
                {" "}claims
              </span>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">
                  Page{" "}
                  <span className="font-mono text-zinc-200">{meta.page}</span>
                  {" "}of{" "}
                  <span className="font-mono text-zinc-200">{meta.totalPages}</span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ‹ Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= meta.totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next ›
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                  <tr>
                    <th className="py-2 pr-3">Flow address</th>
                    <th className="py-2 pr-3">Rule</th>
                    <th className="py-2 pr-3">Reward</th>
                    <th className="py-2 pr-3">Prize (set/play)</th>
                    <th className="py-2 pr-3">Top Shot user</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((c) => (
                    <ClaimRow key={`${c.flow_address}_${c.rule_id}`} claim={c} busy={busy} onUpdateStatus={updateStatus} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pager — bottom */}
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                ‹ Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= meta.totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next ›
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default AdminClaimsTable;
