/**
 * lib/referrals.ts
 * ---------------------------------------------------------------------------
 * Referral system primitives. The high-level flow:
 *
 *   1. Every user is assigned a stable `referral_code` on first sign-in
 *      (8-char hex, unique). Backfill in schema.sql gives existing users a
 *      deterministic code derived from md5(flow_address).
 *
 *   2. A visitor lands on /?ref=ABCD1234 (or /r/ABCD1234). The client
 *      <ReferralCapture /> component (mounted in root layout) POSTs the code
 *      to /api/referral/capture which sets an HttpOnly cookie `tsr_ref`
 *      (90-day TTL).
 *
 *   3. When the visitor connects their wallet for the first time,
 *      /api/auth/verify reads the cookie, looks up the referrer, and:
 *        - sets users.referred_by + users.referred_at on the new user
 *        - awards the referrer +200 TSR via reason_key
 *          'referral.signup.<new_user_address>' (one-time per referee)
 *        - awards the new user a +50 welcome bonus
 *      Self-referrals and re-attributions are blocked.
 * ---------------------------------------------------------------------------
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const REFERRER_AWARD_POINTS = 200;
export const REFEREE_WELCOME_POINTS = 50;

/** Generate a random 8-char hex code, uppercased. ~4.3B keyspace. */
export function generateReferralCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Ensure the user has a `referral_code`. Idempotent — returns the existing
 * code if one is set, otherwise generates one (with retry on the rare
 * unique-constraint collision) and persists it.
 */
export async function ensureReferralCode(
  sb: SupabaseClient,
  address: string,
): Promise<string | null> {
  const { data } = await sb
    .from("users")
    .select("referral_code")
    .eq("flow_address", address)
    .maybeSingle();
  const existing = (data as { referral_code: string | null } | null)?.referral_code;
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const { error } = await sb
      .from("users")
      .update({ referral_code: code })
      .eq("flow_address", address);
    if (!error) return code;
    if ((error as { code?: string }).code !== "23505") {
      // Non-collision DB error — bail out, will retry next sign-in.
      console.error("[referrals] ensureReferralCode failed:", error);
      return null;
    }
  }
  console.error("[referrals] could not generate a unique code after 5 tries");
  return null;
}

/**
 * Attribute a referral to a brand-new user. Safe to call always — bails if:
 *   - the new user already has referred_by set (already attributed)
 *   - the code does not resolve to a valid user
 *   - the resolved referrer is the new user themselves (self-referral)
 *
 * Returns the referrer's flow_address on success, null otherwise.
 *
 * Awards (idempotent via reason_key):
 *   - referrer:  +200 TSR  ('referral.signup.<new_user>')
 *   - new user:  +50  TSR  ('referral.welcome')
 */
export async function attributeReferral(
  sb: SupabaseClient,
  newUserAddress: string,
  rawCode: string,
): Promise<string | null> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-F0-9]{8}$/.test(code)) return null;

  // 1. Resolve referrer.
  const { data: refRow } = await sb
    .from("users")
    .select("flow_address")
    .eq("referral_code", code)
    .maybeSingle();
  const referrerAddress = (refRow as { flow_address: string } | null)?.flow_address;
  if (!referrerAddress) return null;
  if (referrerAddress === newUserAddress) return null; // self-referral

  // 2. Confirm new user has no existing attribution. Only set referred_by
  //    if it's currently NULL so re-runs are no-ops.
  const { data: updRows, error: updErr } = await sb
    .from("users")
    .update({
      referred_by: referrerAddress,
      referred_at: new Date().toISOString(),
    })
    .eq("flow_address", newUserAddress)
    .is("referred_by", null)
    .select("flow_address");
  if (updErr) {
    console.error("[referrals] failed to set referred_by:", updErr);
    return null;
  }
  // No rows updated → already attributed; do not double-award.
  if (!updRows || updRows.length === 0) return null;

  // 3. Award the referrer (idempotent via reason_key per referee).
  await sb.from("tsr_adjustments").insert({
    flow_address: referrerAddress,
    points: REFERRER_AWARD_POINTS,
    reason: `Referral: signed up ${newUserAddress}`,
    reason_key: `referral.signup.${newUserAddress}`,
    created_by: "referrals",
  });

  // 4. Award welcome bonus to the new user.
  await sb.from("tsr_adjustments").insert({
    flow_address: newUserAddress,
    points: REFEREE_WELCOME_POINTS,
    reason: "Referral: welcome bonus",
    reason_key: "referral.welcome",
    created_by: "referrals",
  });

  return referrerAddress;
}

export interface ReferralStats {
  code: string | null;
  referralCount: number;
  totalEarned: number;
  referees: Array<{
    address: string;
    username: string | null;
    avatarUrl: string | null;
    referredAt: string;
  }>;
}

/** Read-only summary of a user's referral activity. */
export async function getReferralStats(
  sb: SupabaseClient,
  address: string,
): Promise<ReferralStats> {
  const [meRes, refsRes, awardsRes] = await Promise.all([
    sb.from("users").select("referral_code").eq("flow_address", address).maybeSingle(),
    sb
      .from("users")
      .select("flow_address, topshot_username, avatar_url, referred_at")
      .eq("referred_by", address)
      .order("referred_at", { ascending: false }),
    sb
      .from("tsr_adjustments")
      .select("points")
      .eq("flow_address", address)
      .like("reason_key", "referral.signup.%"),
  ]);

  const code = (meRes.data as { referral_code: string | null } | null)?.referral_code ?? null;
  const refs =
    (refsRes.data as Array<{
      flow_address: string;
      topshot_username: string | null;
      avatar_url: string | null;
      referred_at: string;
    }> | null) ?? [];
  const awards = (awardsRes.data as Array<{ points: number }> | null) ?? [];

  return {
    code,
    referralCount: refs.length,
    totalEarned: awards.reduce((s, r) => s + (r.points ?? 0), 0),
    referees: refs.map((r) => ({
      address: r.flow_address,
      username: r.topshot_username,
      avatarUrl: r.avatar_url,
      referredAt: r.referred_at,
    })),
  };
}
