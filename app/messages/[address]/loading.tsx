import { SiteHeader } from "@/components/SiteHeader";
import { SkeletonMessageBubble } from "@/components/skeletons";

export default function ChatLoading() {
  return (
    <>
      <SiteHeader subtitle="Messages" />
      <main className="mx-auto flex h-[calc(100vh-64px)] w-full max-w-3xl flex-col px-4 py-4">
        <div className="mb-4 flex items-center gap-3 border-b border-white/10 pb-4">
          <div className="motion-safe:animate-pulse h-4 w-12 rounded bg-white/5" />
          <div className="motion-safe:animate-pulse h-10 w-10 shrink-0 rounded-full bg-white/5" />
          <div className="flex flex-col gap-1.5">
            <div className="motion-safe:animate-pulse h-4 w-28 rounded bg-white/5" />
            <div className="motion-safe:animate-pulse h-3 w-20 rounded bg-white/5" />
          </div>
        </div>
        <div className="flex-1 space-y-4 overflow-hidden pr-2">
          <SkeletonMessageBubble fromMe={false} />
          <SkeletonMessageBubble fromMe={true} />
          <SkeletonMessageBubble fromMe={false} />
          <SkeletonMessageBubble fromMe={true} />
          <SkeletonMessageBubble fromMe={false} />
        </div>
        <div className="mt-4 flex gap-2 border-t border-white/10 pt-4">
          <div className="motion-safe:animate-pulse flex-1 rounded-xl border border-white/10 bg-white/5 h-12" />
          <div className="motion-safe:animate-pulse h-12 w-20 rounded-xl bg-orange-500/20" />
        </div>
      </main>
    </>
  );
}
