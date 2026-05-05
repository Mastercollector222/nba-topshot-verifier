/**
 * lib/notifications.ts
 * ---------------------------------------------------------------------------
 * Server-side helper for inserting rows into `public.notifications`.
 * Always uses the service-role client so it bypasses RLS — callers must
 * already have validated the target address.
 *
 * Never throws: notification failure should never break the primary flow.
 * Errors are swallowed and logged to stderr.
 * ---------------------------------------------------------------------------
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationKind = "badge" | "challenge" | "rank" | "admin";

export interface NotificationPayload {
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
}

/**
 * Insert a single notification row for `address`.
 * Best-effort — swallows errors so callers never have to try/catch.
 */
export async function createNotification(
  sb: SupabaseClient,
  address: string,
  payload: NotificationPayload,
): Promise<void> {
  try {
    const { error } = await sb.from("notifications").insert({
      flow_address: address,
      kind: payload.kind,
      title: payload.title,
      body: payload.body ?? null,
      href: payload.href ?? null,
    });
    if (error) {
      console.error("[notifications] insert failed:", error.message);
    }
  } catch (e) {
    console.error("[notifications] unexpected error:", e);
  }
}
