import { SiteHeader } from "@/components/SiteHeader";
import { Skeleton } from "@/components/Skeleton";

export default function ForgeLoading() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <SiteHeader />
      {/* Hero skeleton */}
      <div className="border-b border-white/5 bg-gradient-to-br from-orange-600/20 via-red-500/10 to-amber-500/15">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <Skeleton className="mb-3 h-3 w-40 rounded" />
          <Skeleton className="mb-3 h-10 w-64 rounded-lg" />
          <Skeleton className="h-4 w-full max-w-lg rounded" />
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      </main>
    </div>
  );
}
