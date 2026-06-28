import { SiteHeader } from "@/components/SiteHeader";
import { Skeleton } from "@/components/Skeleton";

export default function RewardsLoading() {
  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader subtitle="Rewards" />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
        <div>
          <Skeleton className="mb-2 h-8 w-56 rounded-lg" />
          <Skeleton className="h-4 w-full max-w-md rounded" />
        </div>
        {/* Hero KPI row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        {/* Streak ladder */}
        <Skeleton className="h-48 rounded-2xl" />
        {/* Daily actions */}
        <Skeleton className="h-40 rounded-2xl" />
      </main>
    </div>
  );
}
