import { SiteHeader } from "@/components/SiteHeader";
import { Skeleton } from "@/components/Skeleton";

export default function TreasureHuntLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0b1326] text-amber-50">
      <SiteHeader subtitle="Treasure Hunt" />
      <section className="border-b border-amber-500/20">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-4 px-6 py-16 text-center">
          <Skeleton className="h-6 w-48 rounded-full" />
          <Skeleton className="h-12 w-80 rounded-lg" />
          <Skeleton className="h-4 w-full max-w-md rounded" />
        </div>
      </section>
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="grid gap-5 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      </main>
    </div>
  );
}
