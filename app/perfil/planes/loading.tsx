import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div>
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-3 h-7 w-72 max-w-full" />
        <Skeleton className="mt-3 h-4 w-full max-w-[60ch]" />
        <Skeleton className="mt-1.5 h-4 w-2/3 max-w-[45ch]" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card flex flex-col gap-4 rounded-2xl border p-6 sm:p-8">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-28" />
            <div className="bg-border h-px" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-2/3" />
            <div className="bg-border h-px" />
            <div className="flex flex-1 flex-col gap-2.5">
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="h-3.5 w-full" />
              ))}
            </div>
            <Skeleton className="h-12 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
