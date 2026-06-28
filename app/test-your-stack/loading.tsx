import { SiteHeader } from "@/components/SiteHeader";
import { Skeleton } from "@/components/Skeleton";

export default function StackLoading() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <SiteHeader />
      <div className="border-b border-white/5 bg-gradient-to-br from-orange-500/15 via-fuchsia-500/10 to-cyan-500/15">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 text-center">
          <Skeleton className="mx-auto mb-3 h-3 w-36 rounded" />
          <Skeleton className="mx-auto mb-3 h-10 w-72 rounded-lg" />
          <Skeleton className="mx-auto h-4 w-full max-w-md rounded" />
        </div>
      </div>
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </main>
    </div>
  );
}
