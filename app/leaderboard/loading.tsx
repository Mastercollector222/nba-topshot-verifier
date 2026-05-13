import { SiteHeader } from "@/components/SiteHeader";
import { SkeletonLeaderboardRow } from "@/components/skeletons";

export default function LeaderboardLoading() {
  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader subtitle="Leaderboard" />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
        <section className="glass-strong relative flex flex-col gap-3 overflow-hidden rounded-2xl p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-amber-400/15 blur-3xl" />
          <div className="motion-safe:animate-pulse h-2.5 w-24 rounded bg-white/5" />
          <div className="motion-safe:animate-pulse h-9 w-64 rounded-lg bg-white/5" />
          <div className="motion-safe:animate-pulse h-3.5 w-full max-w-lg rounded bg-white/5" />
          <div className="motion-safe:animate-pulse mt-2 h-9 w-44 rounded-full bg-white/5" />
        </section>
        <div className="glass overflow-hidden rounded-2xl">
          {Array.from({ length: 10 }).map((_, i) => (
            <SkeletonLeaderboardRow key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}
