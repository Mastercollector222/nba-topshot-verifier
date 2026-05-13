import { SiteHeader } from "@/components/SiteHeader";
import { SkeletonChallengeCard } from "@/components/skeletons";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader subtitle="Dashboard" />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-10">
        <section className="glass-strong relative overflow-hidden rounded-2xl p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-orange-500/15 blur-3xl" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-3">
              <div className="motion-safe:animate-pulse h-2.5 w-24 rounded bg-white/5" />
              <div className="motion-safe:animate-pulse h-8 w-64 rounded-lg bg-white/5" />
              <div className="motion-safe:animate-pulse h-3 w-80 rounded bg-white/5" />
            </div>
            <div className="flex flex-wrap items-center gap-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col items-end gap-1">
                  <div className="motion-safe:animate-pulse h-2.5 w-20 rounded bg-white/5" />
                  <div className="motion-safe:animate-pulse h-7 w-14 rounded bg-white/5" />
                </div>
              ))}
              <div className="motion-safe:animate-pulse h-10 w-32 rounded-full bg-white/5" />
            </div>
          </div>
        </section>
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonChallengeCard key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}
