import { SiteHeader } from "@/components/SiteHeader";
import { Skeleton } from "@/components/Skeleton";

export default function MintLoading() {
  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader subtitle="Mint" />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
        <div>
          <Skeleton className="mb-2 h-3 w-28 rounded" />
          <Skeleton className="mb-3 h-8 w-56 rounded-lg" />
          <Skeleton className="h-4 w-full max-w-md rounded" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-12 w-48 rounded-full" />
      </main>
    </div>
  );
}
