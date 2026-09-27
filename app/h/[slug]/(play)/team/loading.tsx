import { Skeleton, SkeletonRows } from "@/components/home/skeleton";

/** Team page skeleton: the header, the invite card and the member list. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-10">
      <output className="sr-only">Loading your team</output>
      <div aria-hidden className="flex items-center gap-4">
        <Skeleton className="size-20 rounded-full" />
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div aria-hidden className="flex flex-col gap-3">
        <Skeleton className="h-7 w-44" />
        <div className="flex flex-col gap-5 rounded-xl border border-line p-5 sm:flex-row sm:justify-between sm:p-6">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-16 w-56" />
            <Skeleton className="h-4 w-64 max-w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-11 w-40" />
              <Skeleton className="h-11 w-32" />
            </div>
          </div>
          <Skeleton className="size-44 self-center rounded-sm" />
        </div>
      </div>
      <div aria-hidden className="flex flex-col gap-2">
        <Skeleton className="h-7 w-28" />
        <SkeletonRows rows={3} />
      </div>
    </div>
  );
}
