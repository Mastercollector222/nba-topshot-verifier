import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabase";

export interface PushPayload {
  title: string;
  body?: string;
  href?: string;
  icon?: string;
}

function configured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
}

function init() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function sendPushToUser(
  flowAddress: string,
  payload: PushPayload,
): Promise<void> {
  if (!configured()) return;

  try {
    init();
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("flow_address", flowAddress);

    if (error || !data || data.length === 0) return;

    const notification = JSON.stringify({
      title: payload.title,
      body: payload.body ?? "",
      href: payload.href ?? "/dashboard",
      icon: payload.icon ?? "/icons/icon-192.png",
    });

    const stale: string[] = [];

    await Promise.allSettled(
      (data as SubscriptionRow[]).map(async (row) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: row.endpoint,
              keys: { p256dh: row.p256dh, auth: row.auth },
            },
            notification,
          );
          await sb
            .from("push_subscriptions")
            .update({ last_used_at: new Date().toISOString() })
            .eq("endpoint", row.endpoint);
        } catch (err: unknown) {
          const status =
            err && typeof err === "object" && "statusCode" in err
              ? (err as { statusCode: number }).statusCode
              : 0;
          if (status === 410 || status === 404) {
            stale.push(row.endpoint);
          } else {
            console.error("[push] send failed:", err);
          }
        }
      }),
    );

    if (stale.length > 0) {
      await sb.from("push_subscriptions").delete().in("endpoint", stale);
    }
  } catch (e) {
    console.error("[push] unexpected error:", e);
  }
}
