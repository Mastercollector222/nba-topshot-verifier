/**
 * lib/messages.ts
 * ---------------------------------------------------------------------------
 * Server-side helpers for direct messaging (dm_threads + dm_messages).
 * All writes use service-role to bypass RLS.
 * ---------------------------------------------------------------------------
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "./notifications";

/**
 * Normalize two addresses so user_a < user_b.
 */
function normalizeThreadUsers(a: string, b: string): { user_a: string; user_b: string } {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? { user_a: x, user_b: y } : { user_a: y, user_b: x };
}

/**
 * Get or create a thread for the given pair.
 * Returns the thread id.
 */
export async function getOrCreateThread(
  sb: SupabaseClient,
  viewer: string,
  other: string,
): Promise<{ id: string }> {
  const { user_a, user_b } = normalizeThreadUsers(viewer, other);

  // Try to find existing
  const { data: existing } = await sb
    .from("dm_threads")
    .select("id")
    .eq("user_a", user_a)
    .eq("user_b", user_b)
    .maybeSingle();

  if (existing?.id) {
    return { id: existing.id };
  }

  // Create new
  const { data: inserted, error } = await sb
    .from("dm_threads")
    .insert({ user_a, user_b })
    .select("id")
    .single();

  if (error || !inserted?.id) {
    throw new Error(`Failed to create thread: ${error?.message ?? "unknown"}`);
  }

  return { id: inserted.id };
}

/**
 * Send a message and notify the recipient.
 * Handles thread creation, message insert, updating last_message_at,
 * and upserting a notification (de-dupe: updates existing unread notification).
 */
export async function sendMessage(
  sb: SupabaseClient,
  viewer: string,
  other: string,
  body: string,
): Promise<void> {
  const threadId = (await getOrCreateThread(sb, viewer, other)).id;

  // Insert message
  const { error: msgError } = await sb.from("dm_messages").insert({
    thread_id: threadId,
    sender_address: viewer,
    body,
  });

  if (msgError) {
    throw new Error(`Failed to insert message: ${msgError.message}`);
  }

  // Update thread last_message_at
  await sb
    .from("dm_threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", threadId);

  // Lookup sender username for notification title
  const { data: senderUser } = await sb
    .from("users")
    .select("topshot_username")
    .eq("flow_address", viewer)
    .maybeSingle();
  const senderName = (senderUser as { topshot_username?: string | null } | null)
    ?.topshot_username ?? `${viewer.slice(0, 6)}…${viewer.slice(-4)}`;

  // De-dupe: check for existing unread message notification for this thread
  const { data: existingNote } = await sb
    .from("notifications")
    .select("id")
    .eq("flow_address", other)
    .eq("kind", "message")
    .is("read_at", null)
    .ilike("href", `%/messages/${viewer}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const truncatedBody = body.length > 80 ? body.slice(0, 77) + "..." : body;
  const notePayload = {
    kind: "message" as const,
    title: `${senderName} sent you a message`,
    body: truncatedBody,
    href: `/messages/${viewer}`,
  };

  if (existingNote?.id) {
    // Update existing notification (fresh timestamp + body)
    await sb
      .from("notifications")
      .update({
        created_at: new Date().toISOString(),
        body: truncatedBody,
      })
      .eq("id", existingNote.id);
  } else {
    // Create new notification
    await createNotification(sb, other, notePayload);
  }
}
