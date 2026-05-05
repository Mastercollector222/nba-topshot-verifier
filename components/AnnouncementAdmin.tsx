"use client";

/**
 * components/AnnouncementAdmin.tsx
 * ---------------------------------------------------------------------------
 * Admin card for sending broadcast (or targeted) notifications.
 * Renders inside app/admin/page.tsx.
 * ---------------------------------------------------------------------------
 */

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Kind = "admin" | "rank" | "badge" | "challenge";

const KIND_OPTIONS: { value: Kind; label: string; icon: string }[] = [
  { value: "admin",     label: "Announcement", icon: "📣" },
  { value: "challenge", label: "Challenge",    icon: "🏆" },
  { value: "badge",     label: "Badge",        icon: "🏅" },
  { value: "rank",      label: "Rank",         icon: "📈" },
];

export function AnnouncementAdmin() {
  const [title, setTitle]       = useState("");
  const [body, setBody]         = useState("");
  const [href, setHref]         = useState("");
  const [kind, setKind]         = useState<Kind>("admin");
  const [addresses, setAddresses] = useState("");
  const [busy, setBusy]         = useState(false);
  const [result, setResult]     = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function send() {
    if (!title.trim()) { setResult({ kind: "err", text: "Title is required." }); return; }
    setResult(null);
    setBusy(true);
    try {
      const addrList = addresses
        .split(/[\n,]+/)
        .map((a) => a.trim())
        .filter(Boolean);
      const res = await fetch("/api/admin/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body:  body.trim()  || undefined,
          href:  href.trim()  || undefined,
          kind,
          addresses: addrList.length > 0 ? addrList : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { sent?: number; error?: string };
      if (!res.ok) {
        setResult({ kind: "err", text: data.error ?? `HTTP ${res.status}` });
      } else {
        setResult({ kind: "ok", text: `Sent to ${data.sent} user${data.sent === 1 ? "" : "s"}.` });
        setTitle(""); setBody(""); setHref(""); setAddresses("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>📣 Send notification</CardTitle>
        <CardDescription>
          Broadcast to all verified users, or paste specific Flow addresses (one per line or comma-separated) to target individuals.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Kind selector */}
        <div className="flex flex-wrap gap-2">
          {KIND_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setKind(o.value)}
              className={
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition " +
                (kind === o.value
                  ? "border-orange-400/50 bg-orange-400/10 text-orange-300"
                  : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500")
              }
            >
              {o.icon} {o.label}
            </button>
          ))}
        </div>

        {/* Title */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. New challenge available!"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-orange-400/60 focus:outline-none"
          />
        </div>

        {/* Body */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            Body <span className="text-zinc-600">(optional)</span>
          </label>
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Short description shown under the title"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-orange-400/60 focus:outline-none"
          />
        </div>

        {/* Link */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            Link <span className="text-zinc-600">(optional — e.g. /dashboard)</span>
          </label>
          <input
            type="text"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="/dashboard"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-orange-400/60 focus:outline-none"
          />
        </div>

        {/* Target addresses */}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            Target addresses{" "}
            <span className="text-zinc-600">(leave blank to send to ALL verified users)</span>
          </label>
          <textarea
            value={addresses}
            onChange={(e) => setAddresses(e.target.value)}
            rows={3}
            placeholder={"0x214fdf1a68530b98\n0xabc123..."}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:border-orange-400/60 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={() => void send()} disabled={busy || !title.trim()}>
            {busy ? "Sending…" : "Send notification"}
          </Button>
          {result && (
            <p className={
              "text-xs " +
              (result.kind === "ok" ? "text-emerald-400" : "text-red-400")
            }>
              {result.text}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
