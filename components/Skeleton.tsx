/**
 * components/Skeleton.tsx
 * Reusable pulse skeleton block. Drop-in replacement for spinners.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={
        "animate-pulse rounded-2xl bg-white/5 " + className
      }
    />
  );
}

export default Skeleton;
