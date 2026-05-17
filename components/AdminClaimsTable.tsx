"use client";

/**
 * components/AdminClaimsTable.tsx
 * ---------------------------------------------------------------------------
 * Admin-only view of reward claims with search, filters (URL-persisted),
 * checkbox bulk actions, and CSV export.
 * ---------------------------------------------------------------------------
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/components/Toaster";

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
const DEBOUNCE_MS = 300;
const BULK_CONCURRENCY = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  shipping_status: string | null;
  carrier: string | null;
  tracking_number: string | null;
  rule?: {
    is_physical: boolean;
    physical_title: string | null;
    physical_description: string | null;
    physical_image_url: string | null;
  };
}

interface RuleOption {
  id: string;
  reward: string;
}

interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function claimKey(c: Claim) {
  return `${c.flow_address}||${c.rule_id}`;
}

function buildCsv(claims: Claim[]): string {
  const headers = [
    "flow_address", "rule_id", "topshot_username", "reward_label",
    "status", "shipping_status", "carrier", "tracking_number",
    "ship_full_name", "ship_address_line1", "ship_city", "ship_state",
    "ship_postal_code", "ship_country", "ship_phone", "created_at",
  ];
  const escape = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const rows = claims.map((c) =>
    [
      c.flow_address, c.rule_id, c.topshot_username, c.reward_label,
      c.status, c.shipping_status, c.carrier, c.tracking_number,
      c.ship_full_name, c.ship_address_line1, c.ship_city, c.ship_state,
      c.ship_postal_code, c.ship_country, c.ship_phone, c.created_at,
    ].map(escape).join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}

async function patchClaim(flowAddress: string, ruleId: string, status: string) {
  const res = await fetch("/api/admin/claims", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ flowAddress, ruleId, status }),
  });
  return res.ok;
}

async function runBulk(
  claims: Claim[],
  status: string,
  concurrency: number,
): Promise<{ ok: number; fail: number }> {
  let ok = 0;
  let fail = 0;
  const queue = [...claims];
  const worker = async () => {
    while (queue.length > 0) {
      const c = queue.shift();
      if (!c) break;
      const success = await patchClaim(c.flow_address, c.rule_id, status);
      if (success) ok++; else fail++;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { ok, fail };
}

// ---------------------------------------------------------------------------
// ClaimRow
// ---------------------------------------------------------------------------

function ClaimRow({
  claim: c,
  busy,
  selected,
  onSelect,
  onUpdateStatus,
}: {
  claim: Claim;
  busy: boolean;
  selected: boolean;
  onSelect: (key: string, checked: boolean) => void;
  onUpdateStatus: (c: Claim, status: Claim["status"]) => Promise<void>;
}) {
  const [showShipping, setShowShipping] = useState(false);
  const isPhysical = c.rule?.is_physical ?? false;
  const key = claimKey(c);

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
        {/* Checkbox */}
        <td className="py-2 pr-2 w-6">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(key, e.target.checked)}
            className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 accent-orange-500"
          />
        </td>
        <td className="py-2 pr-3 font-mono text-[11px]">
          {c.flow_address}
          <CopyButton value={c.flow_address} />
        </td>
        <td className="py-2 pr-3 font-mono text-[11px]">{c.rule_id}</td>
        <td className="py-2 pr-3 text-[11px]">{c.reward_label ?? "—"}</td>
        <td className="py-2 pr-3 font-mono text-[11px]">
          {c.reward_set_id != null || c.reward_play_id != null
            ? `${c.reward_set_id ?? "?"} / ${c.reward_play_id ?? "?"}`
            : "—"}
        </td>
        <td className="py-2 pr-3 font-medium text-[11px]">
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
            <Badge variant="outline" className="border-purple-500/40 text-purple-600 dark:text-purple-300 text-[10px]">
              PHYSICAL
            </Badge>
          ) : (
            <span className="text-zinc-500 text-[11px]">Digital</span>
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
          <td colSpan={9} className="py-3 pr-3">
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
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(fullAddress)}
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

// ---------------------------------------------------------------------------
// Inner table (needs Suspense for useSearchParams)
// ---------------------------------------------------------------------------

function AdminClaimsInner() {
  const router = useRouter();
  const sp = useSearchParams();

  // URL-persisted filter state
  const urlQ = sp.get("q") ?? "";
  const urlStatus = sp.get("status") ?? "";
  const urlType = sp.get("type") ?? "";
  const urlRule = sp.get("rule") ?? "";
  const urlPage = Math.max(1, parseInt(sp.get("claimsPage") ?? "1", 10));

  // Local search input (debounced before going to URL)
  const [searchInput, setSearchInput] = useState(urlQ);

  // Data
  const [claims, setClaims] = useState<Claim[]>([]);
  const [meta, setMeta] = useState<PageMeta>({ total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState<RuleOption[]>([]);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allKeys = useMemo(() => claims.map(claimKey), [claims]);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));
  const someSelected = selected.size > 0;

  // Debounce search → URL
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushParams = useCallback(
    (patch: Record<string, string>) => {
      const p = new URLSearchParams(sp.toString());
      Object.entries(patch).forEach(([k, v]) => {
        if (v) p.set(k, v); else p.delete(k);
      });
      // Reset page when filters change
      if (!("claimsPage" in patch)) p.delete("claimsPage");
      router.replace(`?${p.toString()}`, { scroll: false });
    },
    [sp, router],
  );

  // Sync searchInput → URL after debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (searchInput !== urlQ) pushParams({ q: searchInput });
    }, DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Sync URL q → input (e.g. on reset)
  useEffect(() => { setSearchInput(urlQ); }, [urlQ]);

  // Load rules for dropdown (once)
  useEffect(() => {
    void fetch("/api/admin/rules", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((data: { rules?: { id: string; reward: string }[] } | null) => {
        if (data?.rules) setRules(data.rules.map((r) => ({ id: r.id, reward: r.reward })));
      });
  }, []);

  // Load claims whenever URL params change
  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const params = new URLSearchParams();
      params.set("page", String(urlPage));
      params.set("pageSize", String(PAGE_SIZE));
      if (urlQ) params.set("q", urlQ);
      if (urlStatus) params.set("status", urlStatus);
      if (urlType) params.set("type", urlType);
      if (urlRule) params.set("ruleId", urlRule);
      const res = await fetch(`/api/admin/claims?${params.toString()}`, { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as { claims: Claim[] } & PageMeta;
        setClaims(body.claims);
        setMeta({ total: body.total, page: body.page, pageSize: body.pageSize, totalPages: body.totalPages });
      }
    } finally {
      setLoading(false);
    }
  }, [urlQ, urlStatus, urlType, urlRule, urlPage]);

  useEffect(() => { void load(); }, [load]);

  // Single-row status update
  const updateStatus = useCallback(async (c: Claim, status: Claim["status"]) => {
    setBusy(true);
    try {
      const ok = await patchClaim(c.flow_address, c.rule_id, status);
      if (ok) await load();
    } finally {
      setBusy(false);
    }
  }, [load]);

  // Selection helpers
  const toggleSelect = useCallback((key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allKeys));
    }
  }, [allSelected, allKeys]);

  // Bulk actions
  const selectedClaims = useMemo(
    () => claims.filter((c) => selected.has(claimKey(c))),
    [claims, selected],
  );

  const bulkAction = useCallback(async (status: "sent" | "rejected") => {
    if (status === "rejected") {
      if (!confirm(`Reject ${selectedClaims.length} claim(s)? This cannot be undone.`)) return;
    }
    setBusy(true);
    try {
      const { ok, fail } = await runBulk(selectedClaims, status, BULK_CONCURRENCY);
      toast(
        `Bulk ${status}: ${ok} updated${fail > 0 ? `, ${fail} failed` : ""}`,
        fail > 0 ? "error" : "success",
      );
      await load();
    } finally {
      setBusy(false);
    }
  }, [selectedClaims, load]);

  const exportCsv = useCallback(() => {
    const csv = buildCsv(selectedClaims);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `claims-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${selectedClaims.length} row(s)`, "success");
  }, [selectedClaims]);

  const resetFilters = useCallback(() => {
    setSearchInput("");
    router.replace("?", { scroll: false });
  }, [router]);

  const hasFilters = urlQ || urlStatus || urlType || urlRule;
  const fromRow = (meta.page - 1) * meta.pageSize + 1;
  const toRow = Math.min(meta.page * meta.pageSize, meta.total);

  const selectClass =
    "rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/50";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reward claims</CardTitle>
        <CardDescription>
          Users who earned a reward and submitted their NBA Top Shot username.
          Mark <strong>sent</strong> once you&apos;ve airdropped the prize.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">

        {/* Controls bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative min-w-[180px] flex-1">
            <svg
              viewBox="0 0 24 24"
              className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500"
              fill="none" stroke="currentColor" strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search address, username, reward…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-white/[0.04] py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
            />
          </div>

          {/* Status filter */}
          <select
            value={urlStatus}
            onChange={(e) => pushParams({ status: e.target.value })}
            className={selectClass}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="rejected">Rejected</option>
          </select>

          {/* Type filter */}
          <select
            value={urlType}
            onChange={(e) => pushParams({ type: e.target.value })}
            className={selectClass}
          >
            <option value="">All types</option>
            <option value="digital">Digital</option>
            <option value="physical">Physical</option>
          </select>

          {/* Rule filter */}
          <select
            value={urlRule}
            onChange={(e) => pushParams({ rule: e.target.value })}
            className={selectClass}
          >
            <option value="">All rules</option>
            {rules.map((r) => (
              <option key={r.id} value={r.id}>{r.id}</option>
            ))}
          </select>

          {/* Reset */}
          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
            >
              Reset filters
            </button>
          )}
        </div>

        {/* Count + pager row */}
        {!loading && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
            <span>
              {meta.total === 0
                ? "No matching claims"
                : <>
                    Showing{" "}
                    <span className="font-mono text-zinc-200">{fromRow}–{toRow}</span>
                    {" "}of{" "}
                    <span className="font-mono text-zinc-200">{meta.total}</span>
                    {" "}claim{meta.total !== 1 ? "s" : ""}
                  </>}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">
                Page{" "}
                <span className="font-mono text-zinc-200">{meta.page}</span>
                {" "}of{" "}
                <span className="font-mono text-zinc-200">{meta.totalPages}</span>
              </span>
              <Button
                size="sm" variant="outline"
                disabled={urlPage <= 1 || loading}
                onClick={() => pushParams({ claimsPage: String(urlPage - 1) })}
              >‹ Prev</Button>
              <Button
                size="sm" variant="outline"
                disabled={urlPage >= meta.totalPages || loading}
                onClick={() => pushParams({ claimsPage: String(urlPage + 1) })}
              >Next ›</Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : claims.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {hasFilters ? "No claims match your filters." : "No claims yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="py-2 pr-2 w-6">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 accent-orange-500"
                    />
                  </th>
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
                  <ClaimRow
                    key={claimKey(c)}
                    claim={c}
                    busy={busy}
                    selected={selected.has(claimKey(c))}
                    onSelect={toggleSelect}
                    onUpdateStatus={updateStatus}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Bottom pager */}
        {!loading && meta.totalPages > 1 && (
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm" variant="outline"
              disabled={urlPage <= 1 || loading}
              onClick={() => pushParams({ claimsPage: String(urlPage - 1) })}
            >‹ Prev</Button>
            <Button
              size="sm" variant="outline"
              disabled={urlPage >= meta.totalPages || loading}
              onClick={() => pushParams({ claimsPage: String(urlPage + 1) })}
            >Next ›</Button>
          </div>
        )}
      </CardContent>

      {/* Sticky bulk action bar */}
      {someSelected && (
        <div className="sticky bottom-0 z-20 flex items-center gap-3 rounded-b-xl border-t border-white/5 bg-[oklch(0.12_0.008_265/0.95)] px-5 py-3 backdrop-blur-sm">
          <span className="shrink-0 text-xs font-medium text-zinc-300">
            {selected.size} selected
          </span>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void bulkAction("sent")}
              className="text-emerald-400 hover:bg-emerald-500/10"
            >
              Mark sent ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void bulkAction("rejected")}
              className="text-red-400 hover:bg-red-500/10"
            >
              Reject ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={exportCsv}
            >
              Export CSV ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Exported wrapper with Suspense boundary (required for useSearchParams)
// ---------------------------------------------------------------------------

export function AdminClaimsTable() {
  return (
    <Suspense fallback={
      <Card>
        <CardHeader><CardTitle>Reward claims</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-zinc-500">Loading…</p></CardContent>
      </Card>
    }>
      <AdminClaimsInner />
    </Suspense>
  );
}

export default AdminClaimsTable;
