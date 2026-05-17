/**
 * lib/adminAudit.ts
 * ---------------------------------------------------------------------------
 * Append-only helper for writing rows to public.admin_actions.
 * Non-blocking: if the insert fails, log to console.error and continue.
 * ---------------------------------------------------------------------------
 */

import { supabaseAdmin } from "@/lib/supabase";

export interface AdminAuditParams {
  actor: string;
  action: string;
  targetType?: string;
  targetId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  note?: string;
}

export async function logAdminAction(params: AdminAuditParams): Promise<void> {
  try {
    const sb = supabaseAdmin();
    const { error } = await sb.from("admin_actions").insert({
      actor_address: params.actor,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      before_data: params.before ?? null,
      after_data: params.after ?? null,
      note: params.note ?? null,
    });
    if (error) {
      console.error("[adminAudit] insert failed:", error.message);
    }
  } catch (e) {
    console.error("[adminAudit] unexpected error:", e);
  }
}
