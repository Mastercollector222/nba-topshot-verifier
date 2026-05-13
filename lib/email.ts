/**
 * lib/email.ts
 * ---------------------------------------------------------------------------
 * Resend integration + email templates for the notification system.
 *
 * Required env:
 *   - RESEND_API_KEY    : Server-side Resend API key
 *   - EMAIL_FROM        : Verified sender, e.g. "Top Shot Verifier <noreply@topshotcommunityrewards.com>"
 *   - PUBLIC_BASE_URL   : Origin used for links in emails (e.g. https://topshotcommunityrewards.com)
 *
 * The module degrades gracefully if RESEND_API_KEY is missing — every
 * helper logs a warning and returns { skipped: true } so dev environments
 * without Resend still work (subscribe just becomes a no-op email-wise).
 * ---------------------------------------------------------------------------
 */

import { Resend } from "resend";

let cachedClient: Resend | null = null;

function getClient(): Resend | null {
  if (cachedClient) return cachedClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cachedClient = new Resend(key);
  return cachedClient;
}

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "Top Shot Verifier <noreply@example.com>";
}

function baseUrl(): string {
  return (
    process.env.PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "https://topshotcommunityrewards.com"
  );
}

/** RFC-5322ish lightweight email validator. Strict enough for UX. */
export function isValidEmail(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/** Generate a URL-safe random token (default 32 bytes → 43 chars base64url). */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  // base64url encode
  const b64 = Buffer.from(buf).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/**
 * Wraps body HTML with a basic dark-themed shell so emails render
 * consistently across clients without needing a full templating library.
 */
function shell(title: string, bodyHtml: string, footerHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(
    title,
  )}</title></head><body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e4e4e7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:linear-gradient(180deg,#18181b 0%,#0f0f10 100%);border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 28px 8px;">
          <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#fb7126;font-weight:700;">Top Shot Verifier</div>
          <h1 style="margin:8px 0 16px;font-size:22px;font-weight:600;color:#fafafa;line-height:1.3;">${escapeHtml(title)}</h1>
        </td></tr>
        <tr><td style="padding:0 28px 28px;font-size:14px;line-height:1.6;color:#d4d4d8;">${bodyHtml}</td></tr>
        <tr><td style="padding:20px 28px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#71717a;line-height:1.5;">${footerHtml}</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function btn(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;"><tr><td style="background:linear-gradient(90deg,#fb7126,#f59e0b);border-radius:9999px;"><a href="${escapeHtml(
    href,
  )}" style="display:inline-block;padding:12px 28px;color:#000;font-weight:600;font-size:14px;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`;
}

// ---------------------------------------------------------------------------
// Send helpers
// ---------------------------------------------------------------------------

export interface SendResult {
  ok: boolean;
  skipped?: boolean;
  id?: string;
  error?: string;
}

async function send(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<SendResult> {
  const client = getClient();
  if (!client) {
    console.warn("[email] RESEND_API_KEY not set — skipping send to", to);
    return { ok: false, skipped: true };
  }
  try {
    const { data, error } = await client.emails.send({
      from: fromAddress(),
      to,
      subject,
      html,
      text,
    });
    if (error) {
      console.error("[email] Resend error:", error);
      return { ok: false, error: error.message ?? "send failed" };
    }
    return { ok: true, id: data?.id };
  } catch (e) {
    console.error("[email] send threw:", e);
    return { ok: false, error: e instanceof Error ? e.message : "send threw" };
  }
}

/** Confirmation email with a verification link (expires in 1 hour). */
export async function sendVerificationEmail(
  to: string,
  token: string,
): Promise<SendResult> {
  const link = `${baseUrl()}/api/email/verify?token=${encodeURIComponent(token)}`;
  const subject = "Confirm your email — Top Shot Verifier";
  const body = `
    <p>Tap the button below to confirm <strong>${escapeHtml(to)}</strong> so we can email you when new NBA Top Shot challenges go live.</p>
    ${btn(link, "Confirm my email")}
    <p style="font-size:12px;color:#a1a1aa;">If the button doesn't work, paste this link into your browser:<br><a href="${escapeHtml(
      link,
    )}" style="color:#fb7126;word-break:break-all;">${escapeHtml(link)}</a></p>
    <p style="font-size:12px;color:#a1a1aa;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
  `;
  const footer = `You're receiving this because someone (hopefully you) asked us to verify this address. Reply STOP if you'd like to be removed.`;
  const text =
    `Confirm your email at: ${link}\n\n` +
    `If you didn't request this, ignore this message. Link expires in 1 hour.`;
  return send(to, subject, shell("Confirm your email", body, footer), text);
}

export interface ChallengeNotificationData {
  ruleId: string;
  reward: string;
  ctaUrl: string;
  /** Optional flavour text, e.g. "Limited prize — first 100 wallets." */
  body?: string;
  /** Optional thumbnail (allowed image host). */
  imageUrl?: string;
}

/** "New challenge live" broadcast to a single recipient. */
export async function sendChallengeAnnouncement(
  to: string,
  unsubscribeToken: string,
  data: ChallengeNotificationData,
): Promise<SendResult> {
  const unsubLink = `${baseUrl()}/api/email/unsubscribe?token=${encodeURIComponent(
    unsubscribeToken,
  )}`;
  const subject = `🎯 New challenge: ${data.reward}`;
  const imgHtml = data.imageUrl
    ? `<img src="${escapeHtml(
        data.imageUrl,
      )}" alt="" style="display:block;width:100%;max-width:504px;height:auto;border-radius:10px;margin:0 0 16px;border:1px solid rgba(255,255,255,0.08);">`
    : "";
  const flavour = data.body
    ? `<p style="margin:12px 0;color:#d4d4d8;">${escapeHtml(data.body)}</p>`
    : "";
  const body = `
    ${imgHtml}
    <p style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#a1a1aa;font-weight:600;">A new challenge just went live</p>
    <p style="font-size:18px;font-weight:600;color:#fafafa;margin:6px 0 0;">${escapeHtml(data.reward)}</p>
    ${flavour}
    ${btn(data.ctaUrl, "View challenge")}
    <p style="font-size:12px;color:#a1a1aa;">Verify your collection on the dashboard to see if you've already qualified — or grab the missing Moments before someone else does.</p>
  `;
  const footer = `You're getting this because you subscribed to challenge alerts. <a href="${escapeHtml(
    unsubLink,
  )}" style="color:#a1a1aa;text-decoration:underline;">Unsubscribe</a> any time.`;
  const text =
    `New challenge live: ${data.reward}\n\n` +
    (data.body ? `${data.body}\n\n` : "") +
    `View it here: ${data.ctaUrl}\n\n` +
    `Unsubscribe: ${unsubLink}`;
  return send(to, subject, shell(`New challenge: ${data.reward}`, body, footer), text);
}
