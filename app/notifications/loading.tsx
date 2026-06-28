import { SiteHeader } from "@/components/SiteHeader";
import { Skeleton } from "@/components/Skeleton";

export default function NotificationsLoading() {
  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader subtitle="Notifications" />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-7 w-40 rounded-lg" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-4">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48 rounded" />
              <Skeleton className="h-3 w-full max-w-xs rounded" />
            </div>
            <Skeleton className="h-3 w-10 rounded" />
          </div>
        ))}
      </main>
    </div>
  );
}
