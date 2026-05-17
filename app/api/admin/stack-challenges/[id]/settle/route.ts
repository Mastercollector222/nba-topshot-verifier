/**
 * POST /api/admin/stack-challenges/[id]/settle
 * ---------------------------------------------------------------------------
 * Manually trigger winner determination + prize auto-credit. Idempotent —
 * second call returns the existing snapshot without re-crediting.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";
import { logAdminAction } from "@/lib/adminAudit";
import { settleChallenge } from "@/lib/stackChallenge";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const sb = supabaseAdmin();
  try {
    const result = await settleChallenge(sb, id);

    void logAdminAction({
      actor: gate.address,
      action: "stack_challenge.settle",
      targetType: "stack_challenge",
      targetId: id,
      after: result as unknown as Record<string, unknown>,
      note: result.reason,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Settle failed" },
      { status: 500 },
    );
  }
}
