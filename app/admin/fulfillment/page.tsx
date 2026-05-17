"use client";

/**
 * app/admin/fulfillment/page.tsx
 * ---------------------------------------------------------------------------
 * Focused shipping queue — physical claims only, optimised for "ship N orders
 * quickly". Tab strip persists active status in the URL (?status=...).
 * Right-side slide-over lets admin fill carrier + tracking then mark shipped.
 * ---------------------------------------------------------------------------
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/components/Toaster";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ShippingStatus =
  | "not_required"
  | "queued"
  | "packed"
  | "shipped"
  | "delivered"
  | "returned";

interface Claim {
  flow_address: string;
  rule_id: string;
  topshot_username: string;
  reward_label: string | null;
  status: string;
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
  shipping_status: ShippingStatus | null;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  admin_note_internal: string | null;
  rule?: {
    is_physical: boolean;
    physical_title: string | null;
    physical_description: string | null;
    physical_image_url: string | null;
  };
}

interface Stats {
  queued: number;
  packed: number;
  shipped: number;
  delivered: number;
}

interface ApiResponse {
  claims: Claim[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: Stats;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TABS = [
  { label: "Queued", value: "queued" },
  { label: "Packed", value: "packed" },
  { label: "Shipped", value: "shipped" },
  { label: "Delivered", value: "delivered" },
  { label: "All", value: "all" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

const CARRIERS = ["USPS", "UPS", "FedEx", "DHL", "Other"] as const;

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-amber-500/15 text-amber-400",
  packed: "bg-blue-500/15 text-blue-400",
  shipped: "bg-emerald-500/15 text-emerald-400",
  delivered: "bg-teal-500/15 text-teal-300",
  returned: "bg-red-500/15 text-red-400",
  not_required: "bg-zinc-700/50 text-zinc-500",
};

function fullAddr(c: Claim) {
  return [
    c.ship_full_name,
    c.ship_address_line1,
    c.ship_address_line2,
    [c.ship_city, c.ship_state, c.ship_postal_code].filter(Boolean).join(", "),
    c.ship_country,
  ]
    .filter(Boolean)
    .join("\n");
}

function shortAddr(c: Claim) {
  return [c.ship_city, c.ship_state, c.ship_country].filter(Boolean).join(", ") || "—";
}

// ---------------------------------------------------------------------------
// Stat tile
// ---------------------------------------------------------------------------

function StatTile({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className={`rounded-xl border border-white/5 bg-white/[0.03] p-4 text-center ${accent}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide opacity-70">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    });
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={
        "ml-1 inline-flex shrink-0 items-center rounded p-0.5 transition " +
        (done ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-200")
      }
    >
      {done ? (
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

// ---------------------------------------------------------------------------
// Slide-over
// ---------------------------------------------------------------------------

interface SlideOverProps {
  claim: Claim;
  onClose: () => void;
  onSaved: () => void;
}

function SlideOver({ claim: initial, onClose, onSaved }: SlideOverProps) {
  const [claim, setClaim] = useState(initial);
  const [carrier, setCarrier] = useState(initial.carrier ?? "");
  const [tracking, setTracking] = useState(initial.tracking_number ?? "");
  const [trackingUrl, setTrackingUrl] = useState(initial.tracking_url ?? "");
  const [noteInternal, setNoteInternal] = useState(initial.admin_note_internal ?? "");
  const [busy, setBusy] = useState(false);

  const patch = useCallback(
    async (fields: Record<string, unknown>, successMsg: string) => {
      setBusy(true);
      try {
        const res = await fetch("/api/admin/fulfillment", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            flowAddress: claim.flow_address,
            ruleId: claim.rule_id,
            carrier: carrier || undefined,
            trackingNumber: tracking || undefined,
            trackingUrl: trackingUrl || undefined,
            adminNoteInternal: noteInternal || undefined,
            ...fields,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          toast(body.error ?? `HTTP ${res.status}`, "error");
          return;
        }
        toast(successMsg, "success");
        // Optimistically update local claim state for badge refresh
        setClaim((prev) => ({
          ...prev,
          carrier: carrier || prev.carrier,
          tracking_number: tracking || prev.tracking_number,
          tracking_url: trackingUrl || prev.tracking_url,
          admin_note_internal: noteInternal || prev.admin_note_internal,
          ...(fields.shippingStatus ? { shipping_status: fields.shippingStatus as ShippingStatus } : {}),
        }));
        onSaved();
      } finally {
        setBusy(false);
      }
    },
    [claim.flow_address, claim.rule_id, carrier, tracking, trackingUrl, noteInternal, onSaved],
  );

  const canShip = carrier.trim().length > 0 && tracking.trim().length > 0;
  const addr = fullAddr(claim);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-l border-white/10 bg-[oklch(0.1_0.008_265)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-zinc-100">{claim.rule?.physical_title ?? claim.rule_id}</p>
            <p className="text-xs text-zinc-400">{claim.topshot_username}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-5 px-5 py-5">
          {/* Status badge */}
          <div className="flex items-center gap-2">
            <span
              className={
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium " +
                (STATUS_COLORS[claim.shipping_status ?? ""] ?? "bg-zinc-700/50 text-zinc-400")
              }
            >
              {claim.shipping_status ?? "—"}
            </span>
            <span className="text-xs text-zinc-500">decision: {claim.status}</span>
          </div>

          {/* Shipping address */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Shipping address
              </p>
              {addr && (
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(addr).then(() => toast("Address copied", "success"))}
                  className="flex items-center gap-1 text-[11px] text-zinc-500 transition hover:text-zinc-200"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy full address
                </button>
              )}
            </div>
            {claim.ship_full_name ? (
              <div className="space-y-0.5 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-sm">
                <p className="flex items-center font-medium text-zinc-200">
                  {claim.ship_full_name}
                  <CopyBtn text={claim.ship_full_name} />
                </p>
                <p className="text-zinc-400">
                  {claim.ship_address_line1}
                  <CopyBtn text={claim.ship_address_line1 ?? ""} />
                </p>
                {claim.ship_address_line2 && <p className="text-zinc-400">{claim.ship_address_line2}</p>}
                <p className="text-zinc-400">
                  {[claim.ship_city, claim.ship_state, claim.ship_postal_code].filter(Boolean).join(", ")}
                </p>
                <p className="font-medium text-zinc-300">{claim.ship_country}</p>
                {claim.ship_phone && (
                  <p className="flex items-center gap-1 text-zinc-500 text-xs">
                    📞 {claim.ship_phone}
                    <CopyBtn text={claim.ship_phone} />
                  </p>
                )}
                {claim.ship_email && (
                  <p className="flex items-center gap-1 text-zinc-500 text-xs">
                    ✉️ {claim.ship_email}
                    <CopyBtn text={claim.ship_email} />
                  </p>
                )}
                {claim.ship_notes && (
                  <p className="mt-1 text-xs text-zinc-600 italic">Notes: {claim.ship_notes}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-amber-500">No shipping address provided</p>
            )}
          </div>

          {/* Carrier */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Carrier
            </label>
            <select
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 focus:border-orange-500/50 focus:outline-none"
            >
              <option value="">— Select carrier —</option>
              {CARRIERS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Tracking number */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Tracking number
            </label>
            <input
              type="text"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="e.g. 9400111899223456789012"
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-orange-500/50 focus:outline-none"
            />
          </div>

          {/* Tracking URL (optional) */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Tracking URL <span className="normal-case text-zinc-600">(optional)</span>
            </label>
            <input
              type="url"
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
              placeholder="https://tools.usps.com/go/TrackConfirmAction..."
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-orange-500/50 focus:outline-none"
            />
          </div>

          {/* Primary: Mark shipped */}
          <button
            type="button"
            disabled={!canShip || busy}
            onClick={() => void patch({ shippingStatus: "shipped" }, "Marked as shipped ✓")}
            className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Saving…" : "Mark shipped"}
          </button>
          {!canShip && (
            <p className="text-center text-[11px] text-zinc-600">
              Select a carrier and enter a tracking number first
            </p>
          )}

          {/* Secondary status buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void patch({ shippingStatus: "packed" }, "Marked as packed")}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.07] disabled:opacity-40"
            >
              Mark packed
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void patch({ shippingStatus: "delivered" }, "Marked as delivered")}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.07] disabled:opacity-40"
            >
              Mark delivered
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void patch({ shippingStatus: "returned" }, "Marked as returned")}
              className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
            >
              Mark returned
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void patch({ shippingStatus: "queued" }, "Moved back to queue")}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.07] disabled:opacity-40"
            >
              Back to queue
            </button>
          </div>

          {/* Admin internal note */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Internal note <span className="normal-case text-zinc-600">(admin only)</span>
            </label>
            <textarea
              value={noteInternal}
              onChange={(e) => setNoteInternal(e.target.value)}
              rows={3}
              placeholder="Private notes about this shipment…"
              className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-orange-500/50 focus:outline-none"
            />
          </div>

          {/* Save note separately */}
          <button
            type="button"
            disabled={busy}
            onClick={() => void patch({}, "Note saved")}
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-40"
          >
            Save fields / note
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Inner page (needs Suspense boundary for useSearchParams)
// ---------------------------------------------------------------------------

function FulfillmentInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("status") ?? "queued") as TabValue;

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [openClaim, setOpenClaim] = useState<Claim | null>(null);

  const load = useCallback(
    async (status: string, p: number) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/fulfillment?status=${encodeURIComponent(status)}&page=${p}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const body = (await res.json()) as ApiResponse;
          setData(body);
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    setPage(1);
    void load(activeTab, 1);
  }, [activeTab, load]);

  const setTab = (tab: TabValue) => {
    router.push(`/admin/fulfillment?status=${tab}`);
  };

  const handleSaved = useCallback(() => {
    void load(activeTab, page);
  }, [activeTab, page, load]);

  // ------------------------------------------------------------------


  const stats = data?.stats ?? { queued: 0, packed: 0, shipped: 0, delivered: 0 };
  const claims = data?.claims ?? [];
  const meta = data ? { total: data.total, page: data.page, pageSize: data.pageSize, totalPages: data.totalPages } : null;

  return (
    <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Shipping Queue</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Physical rewards only — track each order through to delivery.</p>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Queued" value={stats.queued} accent="text-amber-400" />
          <StatTile label="Packed" value={stats.packed} accent="text-blue-400" />
          <StatTile label="Shipped" value={stats.shipped} accent="text-emerald-400" />
          <StatTile label="Delivered" value={stats.delivered} accent="text-teal-300" />
        </div>

        {/* Tab strip */}
        <div className="flex gap-1 rounded-xl border border-white/5 bg-white/[0.03] p-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setTab(tab.value)}
              className={
                "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition " +
                (activeTab === tab.value
                  ? "bg-orange-500/20 text-orange-300"
                  : "text-zinc-500 hover:text-zinc-200")
              }
            >
              {tab.label}
              {tab.value !== "all" &&
                stats[tab.value as keyof Stats] !== undefined &&
                stats[tab.value as keyof Stats] > 0 && (
                  <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">
                    {stats[tab.value as keyof Stats]}
                  </span>
                )}
            </button>
          ))}
        </div>

        {/* Claims list */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-white/[0.04]" />
            ))}
          </div>
        ) : claims.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-white/[0.02] px-6 py-12 text-center">
            <p className="text-zinc-400">No claims in this bucket.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {claims.map((c) => (
              <div
                key={`${c.flow_address}_${c.rule_id}`}
                className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 text-sm"
              >
                {/* Username + reward */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-200">{c.topshot_username}</span>
                    <span className="text-zinc-600">·</span>
                    <span className="truncate text-xs text-zinc-400">
                      {c.rule?.physical_title ?? c.rule_id}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-600">{shortAddr(c)}</p>
                </div>

                {/* Shipping status badge */}
                <span
                  className={
                    "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium " +
                    (STATUS_COLORS[c.shipping_status ?? ""] ?? "bg-zinc-700/50 text-zinc-500")
                  }
                >
                  {c.shipping_status ?? "—"}
                </span>

                {/* Open button */}
                <button
                  type="button"
                  onClick={() => setOpenClaim(c)}
                  className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-orange-500/10 hover:text-orange-300"
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              Page{" "}
              <span className="font-mono text-zinc-200">{meta.page}</span> of{" "}
              <span className="font-mono text-zinc-200">{meta.totalPages}</span>
              {" "}({meta.total} total)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => { const p = page - 1; setPage(p); void load(activeTab, p); }}
                className="rounded-lg border border-white/10 px-3 py-1.5 transition hover:bg-white/5 disabled:opacity-40"
              >
                ‹ Prev
              </button>
              <button
                type="button"
                disabled={page >= meta.totalPages || loading}
                onClick={() => { const p = page + 1; setPage(p); void load(activeTab, p); }}
                className="rounded-lg border border-white/10 px-3 py-1.5 transition hover:bg-white/5 disabled:opacity-40"
              >
                Next ›
              </button>
            </div>
          </div>
        )}

      {/* Slide-over */}
      {openClaim && (
        <SlideOver
          claim={openClaim}
          onClose={() => setOpenClaim(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page shell — Suspense boundary required for useSearchParams in App Router
// ---------------------------------------------------------------------------

export default function FulfillmentPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-sm text-zinc-500">Loading…</div>}>
      <FulfillmentInner />
    </Suspense>
  );
}
