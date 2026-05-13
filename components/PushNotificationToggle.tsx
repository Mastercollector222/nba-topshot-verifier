"use client";

import { useEffect, useState } from "react";

type ToggleState =
  | "unsupported"
  | "ios-needs-pwa"
  | "permission-denied"
  | "loading"
  | "subscribed"
  | "unsubscribed";

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    ("standalone" in window.navigator &&
      (window.navigator as { standalone?: boolean }).standalone === true) ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function subscribeToPush(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return null;

  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    try {
      await existing.unsubscribe();
    } catch {
      // ignore
    }
  }

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  return sub;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buf = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buf);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function registerSubscriptionWithServer(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  await fetch("/api/me/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    }),
  });
}

async function unregisterSubscriptionFromServer(endpoint: string): Promise<void> {
  await fetch("/api/me/push/subscribe", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

export function PushNotificationToggle() {
  const [state, setState] = useState<ToggleState>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function detect() {
      if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
        setState("unsupported");
        return;
      }
      if (isIos() && !isInStandaloneMode()) {
        setState("ios-needs-pwa");
        return;
      }
      if (Notification.permission === "denied") {
        setState("permission-denied");
        return;
      }
      const existing = await getExistingSubscription();
      setState(existing ? "subscribed" : "unsubscribed");
    }
    void detect();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("permission-denied");
        return;
      }
      const sub = await subscribeToPush();
      if (!sub) return;
      await registerSubscriptionWithServer(sub);
      setState("subscribed");
    } catch (e) {
      console.error("[push] enable failed:", e);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const sub = await getExistingSubscription();
      if (sub) {
        await unregisterSubscriptionFromServer(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("unsubscribed");
    } catch (e) {
      console.error("[push] disable failed:", e);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      await fetch("/api/me/push/test", { method: "POST" });
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-amber-400" />
        <span className="text-sm text-zinc-400">Checking push status…</span>
      </div>
    );
  }

  if (state === "unsupported") {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm font-medium text-zinc-300">Push Notifications</p>
        <p className="mt-1 text-xs text-zinc-500">
          Your browser does not support push notifications.
        </p>
      </div>
    );
  }

  if (state === "ios-needs-pwa") {
    return (
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
        <p className="text-sm font-semibold text-amber-300">Push Notifications</p>
        <p className="mt-1 text-xs text-zinc-400">
          On iOS, push notifications require the app to be installed. Tap{" "}
          <span className="font-semibold text-zinc-200">Share →</span>{" "}
          <span className="font-semibold text-zinc-200">Add to Home Screen</span>, then
          reopen from your home screen to enable push notifications.
        </p>
      </div>
    );
  }

  if (state === "permission-denied") {
    return (
      <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-4">
        <p className="text-sm font-semibold text-red-300">Push Notifications Blocked</p>
        <p className="mt-1 text-xs text-zinc-400">
          Notifications are blocked in your browser settings. To enable, click the lock
          icon in your address bar and allow notifications for this site.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-200">Push Notifications</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {state === "subscribed"
              ? "You'll receive alerts even when the app is closed."
              : "Get alerts for badges, challenges, and messages."}
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={state === "subscribed" ? disable : enable}
          aria-label={state === "subscribed" ? "Disable push notifications" : "Enable push notifications"}
          className={
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50 " +
            (state === "subscribed" ? "bg-amber-500" : "bg-white/10")
          }
        >
          <span
            className={
              "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 " +
              (state === "subscribed" ? "translate-x-5" : "translate-x-0")
            }
          />
        </button>
      </div>

      {state === "subscribed" && (
        <div className="mt-3 border-t border-white/5 pt-3">
          <button
            type="button"
            disabled={busy}
            onClick={sendTest}
            className="text-[11px] text-zinc-500 underline-offset-2 transition hover:text-zinc-300 disabled:opacity-40"
          >
            Send test notification
          </button>
        </div>
      )}
    </div>
  );
}

export default PushNotificationToggle;
