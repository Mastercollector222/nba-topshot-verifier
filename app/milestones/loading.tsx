import { SiteHeader } from "@/components/SiteHeader";
import { SkeletonMilestoneCard } from "@/components/skeletons";

export default function MilestonesLoading() {
  return (
    <div className="min-h-screen bg-[oklch(0.08_0.008_265)] text-zinc-100">
      <SiteHeader subtitle="Milestones" />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <div className="motion-safe:animate-pulse mb-2 h-2.5 w-24 rounded bg-white/5" />
          <div className="motion-safe:animate-pulse h-8 w-64 rounded-lg bg-white/5" />
          <div className="motion-safe:animate-pulse mt-2 h-3.5 w-full max-w-md rounded bg-white/5" />
        </div>
        <div className="motion-safe:animate-pulse mb-8 h-24 w-full rounded-2xl border border-white/5 bg-white/[0.04]" />
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonMilestoneCard key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}
