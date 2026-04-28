/**
 * /api/admin/badges/award
 * ---------------------------------------------------------------------------
 *   POST   → manually grant a badge to a user (source='manual')
 *   DELETE → revoke a manual or auto badge from a user
 *
 * Body for both: { flowAddress: string, badgeId: string }
 *
 * Manual awards are never overwritten by the auto-award path because we
 * only insert (ignoreDuplicates) on the auto side.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

function normalizeAddress(v: string): string | null {
  const t = v.trim().toLowerCase();
  return /^0x[0-9a-f]{16}$/.test(t) ? t : null;
}

async function readBody(req: Request): Promise<{
  flowAddress: string | null;
  badgeId: string;
} | null> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return null;
  }
  const b = body as { flowAddress?: unknown; badgeId?: unknown };
  if (typeof b.flowAddress !== "string" || typeof b.badgeId !== "string") {
    return null;
  }
  const addr = normalizeAddress(b.flowAddress);
  const bid = b.badgeId.trim();
  if (!bid) return null;
  return { flowAddress: addr, badgeId: bid };
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const parsed = await readBody(req);
  if (!parsed || !parsed.flowAddress) {
    return NextResponse.json(
      { error: "flowAddress (16-hex 0x address) and badgeId required" },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();
  const { error } = await sb.from("user_badges").upsert(
    {
      flow_address: parsed.flowAddress,
      badge_id: parsed.badgeId,
      source: "manual",
    },
    { onConflict: "flow_address,badge_id", ignoreDuplicates: true },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const parsed = await readBody(req);
  if (!parsed || !parsed.flowAddress) {
    return NextResponse.json(
      { error: "flowAddress and badgeId required" },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("user_badges")
    .delete()
    .eq("flow_address", parsed.flowAddress)
    .eq("badge_id", parsed.badgeId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
