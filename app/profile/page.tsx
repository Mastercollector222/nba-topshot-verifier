"use client";

/**
 * app/profile/page.tsx
 * ---------------------------------------------------------------------------
 * "My profile" landing. If the visitor is signed in, redirect to
 * /profile/<their-address>. Otherwise show a sign-in nudge.
 * ---------------------------------------------------------------------------
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";

export default function MyProfilePage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "anon">("loading");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/session", { cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as {
          address?: string | null;
        };
        if (body.address) {
          router.replace(`/profile/${body.address}`);
        } else {
          setStatus("anon");
        }
      } catch {
        setStatus("anon");
      }
    })();
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader subtitle="Profile" />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        {status === "loading" ? (
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-amber-400" />
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">
              Connect your wallet to view your profile
            </h1>
            <p className="max-w-md text-sm text-zinc-400">
              Profiles show your challenges, TSR balance, and earned
              badges. Connect with Dapper or Flow Wallet to load yours.
            </p>
            <Button asChild>
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </>
        )}
      </main>
    </div>
  );
}
