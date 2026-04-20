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
      "rule_id, topshot_username, reward_label, reward_set_id, reward_play_id, status, created_at, updated_at",
    )
    .eq("flow_address", gate.address)
    .order("updated_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ claims: data ?? [] });
}

export async function POST(req: Request) {
  const gate = await authed();
  if (!gate.ok) return gate.res;

  let body: { ruleId?: unknown; topshotUsername?: unknown };
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

  const row = {
    flow_address: gate.address,
    rule_id: ruleId,
    topshot_username: usernameRaw,
    reward_label: rule.reward,
    reward_set_id: "rewardSetId" in rule ? rule.rewardSetId ?? null : null,
    reward_play_id: "rewardPlayId" in rule ? rule.rewardPlayId ?? null : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("reward_claims")
    .upsert(row, { onConflict: "flow_address,rule_id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
