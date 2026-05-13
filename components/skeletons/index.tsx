function Pulse({ className = "" }: { className?: string }) {
  return (
    <div className={"motion-safe:animate-pulse rounded-lg bg-white/5 " + className} />
  );
}

export function SkeletonAvatar({ size = 9 }: { size?: number }) {
  const s = `h-${size} w-${size}`;
  return <Pulse className={`${s} shrink-0 rounded-full`} />;
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={
        "rounded-2xl border border-white/5 bg-white/[0.03] p-5 " + className
      }
    >
      <Pulse className="mb-3 h-4 w-1/3 rounded" />
      <Pulse className="mb-2 h-3 w-full rounded" />
      <Pulse className="h-3 w-4/5 rounded" />
    </div>
  );
}

export function SkeletonTableRow({ cols = 4 }: { cols?: number }) {
  const widths = ["w-9", "w-9", "flex-1", "w-16", "w-20"];
  return (
    <div className="flex items-center gap-4 border-b border-white/5 px-5 py-4 last:border-0">
      {Array.from({ length: cols }).map((_, i) => (
        <Pulse
          key={i}
          className={`h-4 shrink-0 ${i === 2 ? "flex-1" : widths[i] ?? "w-16"}`}
        />
      ))}
    </div>
  );
}

export function SkeletonLeaderboardRow() {
  return (
    <div className="grid grid-cols-[64px_36px_1fr_auto_auto] items-center gap-4 border-b border-white/5 px-5 py-4 last:border-0">
      <Pulse className="h-9 w-14 rounded-xl" />
      <Pulse className="h-9 w-9 rounded-lg" />
      <div className="flex flex-col gap-1.5">
        <Pulse className="h-3.5 w-32 rounded" />
        <Pulse className="h-2.5 w-20 rounded" />
      </div>
      <Pulse className="h-5 w-10 rounded" />
      <Pulse className="hidden h-3 w-20 rounded sm:block" />
    </div>
  );
}

export function SkeletonChallengeCard() {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2 flex-1">
          <Pulse className="h-4 w-2/3 rounded" />
          <Pulse className="h-3 w-1/2 rounded" />
        </div>
        <Pulse className="h-7 w-20 shrink-0 rounded-full" />
      </div>
      <Pulse className="h-1.5 w-full rounded-full" />
    </div>
  );
}

export function SkeletonMessageThread() {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <Pulse className="h-12 w-12 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <Pulse className="h-4 w-28 rounded" />
          <Pulse className="h-3 w-8 rounded" />
        </div>
        <Pulse className="h-3 w-3/4 rounded" />
      </div>
    </div>
  );
}

export function SkeletonMessageBubble({ fromMe = false }: { fromMe?: boolean }) {
  return (
    <div className={`flex ${fromMe ? "justify-end" : "justify-start"}`}>
      <Pulse
        className={`h-14 rounded-2xl ${fromMe ? "w-48 bg-orange-500/10" : "w-56"}`}
      />
    </div>
  );
}

export function SkeletonMilestoneCard() {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2 flex-1">
          <Pulse className="h-5 w-32 rounded" />
          <Pulse className="h-3.5 w-48 rounded" />
          <Pulse className="h-3 w-36 rounded" />
        </div>
        <Pulse className="h-8 w-24 shrink-0 rounded-full" />
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between">
          <Pulse className="h-2.5 w-24 rounded" />
          <Pulse className="h-2.5 w-8 rounded" />
        </div>
        <Pulse className="h-1.5 w-full rounded-full" />
      </div>
    </div>
  );
}

export function SkeletonProfileHeader() {
  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-white/5 bg-white/[0.03] p-6 sm:flex-row sm:items-start">
      <Pulse className="h-24 w-24 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-3">
        <Pulse className="h-6 w-40 rounded" />
        <Pulse className="h-3.5 w-28 rounded" />
        <Pulse className="h-3 w-full max-w-sm rounded" />
        <Pulse className="h-3 w-3/4 max-w-xs rounded" />
      </div>
    </div>
  );
}

export function SkeletonKpiRow() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-white/5 bg-white/[0.03] p-5"
        >
          <Pulse className="mb-2 h-2.5 w-20 rounded" />
          <Pulse className="h-7 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonAdminCard() {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-6">
      <Pulse className="mb-4 h-5 w-36 rounded" />
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-white/5 py-3 last:border-0"
        >
          <Pulse className="h-4 w-24 flex-1 rounded" />
          <Pulse className="h-4 w-16 rounded" />
          <Pulse className="h-6 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}
