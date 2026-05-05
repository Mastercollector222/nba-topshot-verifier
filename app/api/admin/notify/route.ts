/**
 * POST /api/admin/notify
 * ---------------------------------------------------------------------------
 * Send a broadcast announcement notification to some or all users.
 *
 * Body (JSON):
 *   {
 *     title:    string           // required — notification title
 *     body?:    string           // optional — subtitle / detail
 *     href?:    string           // optional — link when clicked
 *     kind?:    "admin"|"rank"|"badge"|"challenge"  // default "admin"
 *     addresses?: string[]       // optional — target specific addresses
 *                                //   omit (or empty) → send to ALL users
 *                                //   that have at least one verified scan
 *   }
 *
 * Response: { sent: number }
 *
 * Admin-only — gated by requireAdmin().
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createNotification } from "@/lib/notifications";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = body as {
    title?: unknown;
    body?: unknown;
    href?: unknown;
    kind?: unknown;
    addresses?: unknown;
  };

  if (typeof b.title !== "string" || !b.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const title  = b.title.trim();
  const detail = typeof b.body === "string" ? b.body.trim() || undefined : undefined;
  const href   = typeof b.href === "string" ? b.href.trim() || undefined : undefined;
  const VALID_KINDS = ["admin", "rank", "badge", "challenge"] as const;
  type Kind = typeof VALID_KINDS[number];
  const kind: Kind =
    typeof b.kind === "string" && (VALID_KINDS as readonly string[]).includes(b.kind)
      ? (b.kind as Kind)
      : "admin";

  const sb = supabaseAdmin();

  // ── Resolve target addresses ───────────────────────────────────────────────
  let targets: string[];

  if (Array.isArray(b.addresses) && b.addresses.length > 0) {
    targets = (b.addresses as unknown[])
      .map((a) => String(a).trim().toLowerCase())
      .filter((a) => /^0x[0-9a-f]{16}$/.test(a));
    if (targets.length === 0) {
      return NextResponse.json({ error: "No valid addresses provided" }, { status: 400 });
    }
  } else {
    // Broadcast to all verified users, paged to handle large tables.
    targets = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from("users")
        .select("flow_address")
        .not("last_verified_at", "is", null)
        .range(from, from + 999);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data || data.length === 0) break;
      for (const row of data as { flow_address: string }[]) {
        targets.push(row.flow_address);
      }
      if (data.length < 1000) break;
    }
  }

  if (targets.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  // ── Insert notifications in parallel batches of 50 ────────────────────────
  const BATCH = 50;
  let sent = 0;
  for (let i = 0; i < targets.length; i += BATCH) {
    const chunk = targets.slice(i, i + BATCH);
    await Promise.all(
      chunk.map((address) =>
        createNotification(sb, address, { kind, title, body: detail, href }),
      ),
    );
    sent += chunk.length;
  }

  return NextResponse.json({ sent });
}
