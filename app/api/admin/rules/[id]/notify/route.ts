/**
 * POST /api/admin/rules/[id]/notify
 * ---------------------------------------------------------------------------
 * Admin-only. Broadcasts a "new challenge live" email to every user with
 * a verified address and email_notifications_enabled = true.
 *
 * Idempotency: if reward_rules.notify_sent_at is already set for this
 * rule, the endpoint returns 409 — admins must explicitly clear that
 * column in SQL to re-fire (intentional safety valve so a stuck client
 * can't spam the entire user base).
 *
 * Body (optional): { body?: string, ctaUrl?: string, imageUrl?: string }
 *   - body     : flavor text under the headline
 *   - ctaUrl   : override the default CTA (defaults to /dashboard)
 *   - imageUrl : optional thumbnail
 *
 * Resend handles per-recipient sends. We loop with a small concurrency
 * cap (5 in flight) since Resend's free tier rate-limits aggressive
 * fan-out.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { sendChallengeAnnouncement } from "@/lib/email";
import { logAdminAction } from "@/lib/adminAudit";

const PUBLIC_BASE =
  process.env.PUBLIC_BASE_URL ??
  process.env.NEXT_PUBLIC_BASE_URL ??
  "https://topshotcommunityrewards.com";

const CONCURRENCY = 5;

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing rule id" }, { status: 400 });

  let body: { body?: unknown; ctaUrl?: unknown; imageUrl?: unknown };
  try {
    body = (await req.json().catch(() => ({}))) as {
      body?: unknown;
      ctaUrl?: unknown;
      imageUrl?: unknown;
    };
  } catch {
    body = {};
  }

  const sb = supabaseAdmin();

  // Load rule and refuse if already broadcast.
  const { data: ruleRow, error: ruleErr } = await sb
    .from("reward_rules")
    .select("id, reward, payload, notify_sent_at, physical_image_url")
    .eq("id", id)
    .maybeSingle();
  if (ruleErr || !ruleRow) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }
  const rule = ruleRow as {
    id: string;
    reward: string;
    payload: Record<string, unknown>;
    notify_sent_at: string | null;
    physical_image_url: string | null;
  };
  if (rule.notify_sent_at) {
    return NextResponse.json(
      { error: "Notifications already sent for this rule" },
      { status: 409 },
    );
  }

  // Compose announcement payload. Falls back to sensible defaults so the
  // admin can fire-and-forget without typing anything.
  const flavour =
    typeof body.body === "string" && body.body.trim() ? body.body.trim() : undefined;
  const ctaUrl =
    typeof body.ctaUrl === "string" && body.ctaUrl.trim()
      ? body.ctaUrl.trim()
      : `${PUBLIC_BASE}/dashboard`;
  const imageUrl =
    typeof body.imageUrl === "string" && body.imageUrl.trim()
      ? body.imageUrl.trim()
      : rule.physical_image_url ?? undefined;

  // Pull subscriber list. We require both verified email AND opt-in flag.
  const { data: subsData, error: subsErr } = await sb
    .from("users")
    .select("flow_address, email, unsubscribe_token")
    .not("email", "is", null)
    .not("email_verified_at", "is", null)
    .eq("email_notifications_enabled", true);
  if (subsErr) {
    return NextResponse.json({ error: subsErr.message }, { status: 500 });
  }
  const subscribers = (subsData ?? []) as Array<{
    flow_address: string;
    email: string;
    unsubscribe_token: string | null;
  }>;

  // Mark sent FIRST (with the count we will attempt) so a partial failure
  // can't cause double-broadcasts. Failed individual sends are logged but
  // don't roll back this gate.
  const { error: gateErr } = await sb
    .from("reward_rules")
    .update({
      notify_sent_at: new Date().toISOString(),
      notify_sent_count: subscribers.length,
    })
    .eq("id", id)
    .is("notify_sent_at", null);
  if (gateErr) {
    return NextResponse.json({ error: "Could not lock rule" }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;

  // Bounded concurrency loop.
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= subscribers.length) return;
      const u = subscribers[i];
      if (!u.email || !u.unsubscribe_token) {
        failed++;
        continue;
      }
      const r = await sendChallengeAnnouncement(u.email, u.unsubscribe_token, {
        ruleId: rule.id,
        reward: rule.reward,
        body: flavour,
        ctaUrl,
        imageUrl,
      });
      if (r.ok) sent++;
      else failed++;
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, subscribers.length || 1) }, () =>
      worker(),
    ),
  );

  void logAdminAction({
    actor: gate.address,
    action: "rule.notify",
    targetType: "rule",
    targetId: id,
    after: { totalSubscribers: subscribers.length, sent, failed },
    note: flavour,
  });

  return NextResponse.json({
    ok: true,
    totalSubscribers: subscribers.length,
    sent,
    failed,
  });
}
