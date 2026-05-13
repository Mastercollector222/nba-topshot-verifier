import { SiteHeader } from "@/components/SiteHeader";
import { SkeletonProfileHeader, SkeletonKpiRow, SkeletonChallengeCard } from "@/components/skeletons";

export default function ProfileLoading() {
  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
        <SkeletonProfileHeader />
        <SkeletonKpiRow />
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonChallengeCard key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}
