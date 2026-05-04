import Link from "next/link";

import { SiteHeader } from "@/components/SiteHeader";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader />

      <main className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="glass-strong relative flex w-full max-w-md flex-col items-center gap-6 overflow-hidden rounded-3xl p-10 text-center">
          {/* Ambient glow */}
          <div className="pointer-events-none absolute -top-16 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-orange-400/20 blur-3xl" />

          <span className="text-6xl leading-none" role="img" aria-label="Basketball">
            🏀
          </span>

          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">
              Out of bounds
            </h1>
            <p className="text-sm text-zinc-400">That page doesn&apos;t exist.</p>
          </div>

          <Link
            href="/dashboard"
            className="rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-2.5 text-sm font-semibold text-black shadow-[0_8px_24px_-8px_rgba(251,191,36,0.6)] transition hover:brightness-110"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
