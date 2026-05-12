/**
 * /api/messages/[address]
 * ---------------------------------------------------------------------------
 *   GET    → thread messages with given other user (paginated)
 *   POST   → send message to that user
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { sendMessage, getOrCreateThread } from "@/lib/messages";
import { supabaseAdmin } from "@/lib/supabase";

function normalizeAddress(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return /^0x[0-9a-f]{16}$/.test(t) ? t : null;
}

// GET: fetch messages, auto-mark unread inbound as read
export async function GET(
  req: Request,
  context: { params: Promise<{ address: string }> },
) {
  const viewer = await getSessionAddress();
  if (!viewer) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { address: raw } = await context.params;
  const other = normalizeAddress(raw);
  if (!other) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (other === viewer) {
    return NextResponse.json({ error: "Cannot message yourself" }, { status: 400 });
  }

  const url = new URL(req.url);
  const before = url.searchParams.get("before"); // ISO string or null
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 100);

  const sb = supabaseAdmin();

  // Ensure thread exists (or get existing)
  const { id: threadId } = await getOrCreateThread(sb, viewer, other);

  // Fetch messages
  let query = sb
    .from("dm_messages")
    .select("id, sender_address, body, created_at, read_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data: messages, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-mark unread inbound messages as read (fire-and-forget)
  const unreadIds = (messages as { id: number; sender_address: string; read_at: string | null }[])
    .filter((m) => m.sender_address !== viewer && !m.read_at)
    .map((m) => m.id);

  if (unreadIds.length > 0) {
    await sb
      .from("dm_messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);
  }

  return NextResponse.json({
    threadId,
    otherAddress: other,
    messages: (messages as unknown[]).reverse(), // oldest first for UI
  });
}

// POST: send message
export async function POST(
  req: Request,
  context: { params: Promise<{ address: string }> },
) {
  const viewer = await getSessionAddress();
  if (!viewer) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { address: raw } = await context.params;
  const other = normalizeAddress(raw);
  if (!other) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (other === viewer) {
    return NextResponse.json({ error: "Cannot message yourself" }, { status: 400 });
  }

  let body: { body?: unknown };
  try {
    body = (await req.json()) as { body?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length < 1 || text.length > 4000) {
    return NextResponse.json({ error: "Message must be 1–4000 characters" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  try {
    await sendMessage(sb, viewer, other, text);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to send";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
