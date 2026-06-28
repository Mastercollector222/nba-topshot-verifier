/**
 * /api/claims
 * ---------------------------------------------------------------------------
 *   POST  → user submits their NBA Top Shot username for a reward they've
 *           earned. Body: `{ ruleId, topshotUsername }`. Upserts by
 *           (flow_address, rule_id) so users can correct a typo'd username.
 *   GET   → returns the signed-in user's claims so the dashboard can show
 *           which rules they've already submitted for.
 *
 * The server re-verifies that the claimer actually owns the rule's earned
 * state before writing — we re-run the rule against their latest snapshot
 * in `owned_moments`. This blocks spoofed claim submissions.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, verifyFlowSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import {
  parseRewardsConfig,
  verify,
  type RewardRule,
} from "@/lib/verify";
import type { OwnedMoment } from "@/lib/topshot";
import rewardsJson from "@/config/rewards.json";

async function authed(): Promise<
  { ok: true; address: string } | { ok: false; res: NextResponse }
> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
    };
  }
  const claims = await verifyFlowSession(token);
  if (!claims?.sub) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Invalid session" }, { status: 401 }),
    };
  }
  return { ok: true, address: claims.sub };
}

/** Loads the active rule set the same way /api/verify does. */
async function loadRules(): Promise<RewardRule[]> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("reward_rules")
    .select("payload, enabled")
    .eq("enabled", true);
  if (data && data.length > 0) {
    return (data as { payload: RewardRule }[]).map((r) => r.payload);
  }
  // Fallback to config file.
  return parseRewardsConfig(rewardsJson).rules;
}

export async function GET() {
  const gate = await authed();
  if (!gate.ok) return gate.res;

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("reward_claims")
    .select(
      "rule_id, topshot_username, reward_label, reward_set_id, reward_play_id, status, created_at, updated_at, ship_full_name, ship_address_line1, ship_city, ship_postal_code, ship_country",
    )
    .eq("flow_address", gate.address)
    .order("updated_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ claims: data ?? [] });
}

interface ShippingInput {
  fullName?: unknown;
  addressLine1?: unknown;
  addressLine2?: unknown;
  city?: unknown;
  state?: unknown;
  postalCode?: unknown;
  country?: unknown;
  phone?: unknown;
  email?: unknown;
  notes?: unknown;
}

function validateShipping(input: unknown): { ok: false; error: string } | { ok: true; shipping: Record<string, string | null> } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Shipping information required for physical rewards" };
  }
  const s = input as ShippingInput;
  const fullName = typeof s.fullName === "string" ? s.fullName.trim() : "";
  const addressLine1 = typeof s.addressLine1 === "string" ? s.addressLine1.trim() : "";
  const city = typeof s.city === "string" ? s.city.trim() : "";
  const postalCode = typeof s.postalCode === "string" ? s.postalCode.trim() : "";
  const country = typeof s.country === "string" ? s.country.trim().toUpperCase() : "";

  if (!fullName || !addressLine1 || !city || !postalCode || !country) {
    return { ok: false, error: "Full name, address, city, postal code, and country are required" };
  }
  if (!/^[A-Z]{2}$/.test(country)) {
    return { ok: false, error: "Country must be a 2-letter ISO code (e.g., US, CA, GB)" };
  }

  return {
    ok: true,
    shipping: {
      ship_full_name: fullName,
      ship_address_line1: addressLine1,
      ship_address_line2: typeof s.addressLine2 === "string" ? s.addressLine2.trim() || null : null,
      ship_city: city,
      ship_state: typeof s.state === "string" ? s.state.trim() || null : null,
      ship_postal_code: postalCode,
      ship_country: country,
      ship_phone: typeof s.phone === "string" ? s.phone.trim() || null : null,
      ship_email: typeof s.email === "string" ? s.email.trim() || null : null,
      ship_notes: typeof s.notes === "string" ? s.notes.trim() || null : null,
    },
  };
}

export async function POST(req: Request) {
  const gate = await authed();
  if (!gate.ok) return gate.res;

  let body: { ruleId?: unknown; topshotUsername?: unknown; shipping?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const ruleId = typeof body.ruleId === "string" ? body.ruleId.trim() : "";
  const usernameRaw =
    typeof body.topshotUsername === "string" ? body.topshotUsername.trim() : "";

  if (!ruleId) {
    return NextResponse.json({ error: "Missing ruleId" }, { status: 400 });
  }
  // Top Shot usernames: alnum + underscore, reasonable length bound.
  if (!/^[A-Za-z0-9_.-]{2,40}$/.test(usernameRaw)) {
    return NextResponse.json(
      { error: "Invalid Top Shot username format" },
      { status: 400 },
    );
  }

  // --- Re-verify ownership before accepting the claim.
  const admin = supabaseAdmin();
  const rulesList = await loadRules();
  const rule = rulesList.find((r) => r.id === ruleId);
  if (!rule) {
    return NextResponse.json({ error: "Unknown ruleId" }, { status: 404 });
  }

  // Supabase caps select() at 1000 rows by default; paginate so large
  // collections (10k+) are fully loaded for the ownership re-check.
  const PAGE = 1000;
  const rows: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("owned_moments")
      .select(
        "moment_id, set_id, play_id, series, serial_number, source_address, set_name, play_metadata, is_locked, lock_expiry",
      )
      .eq("flow_address", gate.address)
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json(
        { error: `Snapshot read failed: ${error.message}` },
        { status: 500 },
      );
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as Array<Record<string, unknown>>));
    if (data.length < PAGE) break;
  }

  const moments: OwnedMoment[] = rows.map((row) => ({
    source: row.source_address as string,
    momentID: String(row.moment_id),
    playID: Number(row.play_id),
    setID: Number(row.set_id),
    serialNumber: Number(row.serial_number),
    setName: (row.set_name as string | null) ?? null,
    series: row.series == null ? null : Number(row.series),
    playMetadata:
      (row.play_metadata as Record<string, string> | null) ?? null,
    thumbnail: null,
    isLocked: Boolean(row.is_locked),
    lockExpiry: row.lock_expiry == null ? null : Number(row.lock_expiry),
  }));

  const result = verify(moments, [rule]);
  const evaluation = result.evaluations[0];
  if (!evaluation?.earned) {
    return NextResponse.json(
      { error: "Reward not earned yet — run a verification first." },
      { status: 403 },
    );
  }

  // Check if this is a physical reward and validate shipping if so
  const { data: ruleMeta } = await admin
    .from("reward_rules")
    .select("is_physical")
    .eq("id", ruleId)
    .maybeSingle();
  const isPhysical = (ruleMeta as { is_physical?: boolean } | null)?.is_physical ?? false;

  let shippingFields: Record<string, string | null> = {};
  if (isPhysical) {
    const shippingCheck = validateShipping(body.shipping);
    if (!shippingCheck.ok) {
      return NextResponse.json({ error: shippingCheck.error }, { status: 400 });
    }
    shippingFields = shippingCheck.shipping;
  }

  const row: Record<string, unknown> = {
    flow_address: gate.address,
    rule_id: ruleId,
    topshot_username: usernameRaw,
    reward_label: rule.reward,
    reward_set_id: "rewardSetId" in rule ? rule.rewardSetId ?? null : null,
    reward_play_id: "rewardPlayId" in rule ? rule.rewardPlayId ?? null : null,
    shipping_status: isPhysical ? "queued" : "not_required",
    updated_at: new Date().toISOString(),
    ...shippingFields,
  };

  const { error } = await admin
    .from("reward_claims")
    .upsert(row, { onConflict: "flow_address,rule_id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
