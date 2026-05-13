"use client";

/**
 * /notifications
 * ---------------------------------------------------------------------------
 * Settings page for email + push notification preferences. Verification
 * links (/api/email/verify) and unsubscribe links (/api/email/unsubscribe)
 * both redirect here with query params so the user lands on a real page
 * instead of seeing raw JSON.
 *
 * Query params:
 *   ?verified=1                → success toast on mount
 *   ?verified=0&reason=expired → error toast with reason mapping
 *   ?unsub=1                   → "you're unsubscribed" notice
 * ---------------------------------------------------------------------------
 */

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { NotificationsCard } from "@/components/NotificationsCard";
import { toast } from "@/components/Toaster";

const REASONS: Record<string, string> = {
  missing: "That link is incomplete. Try resending the confirmation email.",
  invalid: "We couldn't find that verification token.",
  used: "That confirmation link has already been used.",
  expired: "That confirmation link expired. Request a new one below.",
  server: "Something went wrong on our end. Please try again.",
};

function StatusToasts() {
  const sp = useSearchParams();
  useEffect(() => {
    const verified = sp.get("verified");
    const reason = sp.get("reason") ?? "";
    const unsub = sp.get("unsub");
    if (verified === "1") {
      toast("Email verified! You'll get challenge alerts from now on.", "success");
    } else if (verified === "0") {
      toast(REASONS[reason] ?? "Email verification failed.", "error");
    }
    if (unsub === "1") {
      toast("You've been unsubscribed from challenge alerts.", "info");
    } else if (unsub === "0") {
      toast("Couldn't process that unsubscribe link.", "error");
    }
    // Strip the query so reloads don't re-fire toasts.
    if (verified !== null || unsub !== null) {
      const url = new URL(window.location.href);
      url.searchParams.delete("verified");
      url.searchParams.delete("reason");
      url.searchParams.delete("unsub");
      window.history.replaceState({}, "", url.toString());
    }
  }, [sp]);
  return null;
}

export default function NotificationsPage() {
  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader subtitle="Notifications" />
      <Suspense fallback={null}>
        <StatusToasts />
      </Suspense>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Choose how you want to hear about new challenges and rewards.
          </p>
        </div>
        <NotificationsCard />
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-xs text-zinc-500">
          We&apos;ll only email you when a new challenge goes live — no spam,
          no marketing. Unsubscribe with one click from any email.
        </div>
      </main>
    </div>
  );
}
