import { SiteHeader } from "@/components/SiteHeader";
import { SkeletonMessageThread } from "@/components/skeletons";

export default function MessagesLoading() {
  return (
    <>
      <SiteHeader subtitle="Messages" />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="motion-safe:animate-pulse mb-6 h-7 w-32 rounded-lg bg-white/5" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonMessageThread key={i} />
          ))}
        </div>
      </main>
    </>
  );
}
