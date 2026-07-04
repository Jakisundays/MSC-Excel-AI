import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Skeleton className="mb-4 h-4 w-32" />
      <Skeleton className="mb-3 h-5 w-40" />
      <Skeleton className="h-7 w-72" />
      <Skeleton className="mt-2 h-4 w-48" />

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <div className="bg-card rounded-2xl border p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
            </div>
            <Skeleton className="mt-4 h-20 rounded-2xl" />
          </div>
          <Skeleton className="h-32 rounded-2xl" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-12 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
