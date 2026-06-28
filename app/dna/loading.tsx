import { Skeleton } from "@/components/Skeleton";

export default function DnaLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-20">
      <Skeleton className="h-3 w-32 rounded" />
      <Skeleton className="h-10 w-48 rounded-lg" />
      <Skeleton className="h-80 w-full max-w-md rounded-3xl" />
      <Skeleton className="h-10 w-40 rounded-full" />
    </div>
  );
}
