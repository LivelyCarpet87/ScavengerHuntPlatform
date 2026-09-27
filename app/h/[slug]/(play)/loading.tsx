import { Skeleton, SkeletonRows } from "@/components/home/skeleton";

/** Hunt home skeleton: the bib, the finish bar, the control card and the task list. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <output className="sr-only">Loading the hunt</output>
      <div aria-hidden className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex flex-col gap-5 rounded-lg border-2 border-line px-5 pt-5 pb-4 sm:px-7 sm:pt-6">
          <div className="flex items-center gap-3.5">
            <Skeleton className="size-14 rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-7 w-44 max-w-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="flex gap-9 border-t-2 border-dashed border-line pt-4 sm:gap-12">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-14 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-14 w-28" />
              <Skeleton className="h-4 w-14" />
            </div>
          </div>
        </div>
        {/* The phase panel: a slim bar on phones, beside the bib from md. */}
        <Skeleton className="h-[3.25rem] w-full rounded-lg md:h-auto" />
      </div>
      <div aria-hidden>
        <Skeleton className="h-7 w-36" />
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1.5">
          {Array.from({ length: 12 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
            <Skeleton key={i} className="aspect-square rounded-sm" />
          ))}
        </div>
      </div>
      <div aria-hidden className="flex flex-col gap-3">
        <Skeleton className="h-7 w-20" />
        <div className="flex gap-2">
          {["w-16", "w-20", "w-24", "w-18"].map((w) => (
            <Skeleton key={w} className={`h-11 rounded-full ${w}`} />
          ))}
        </div>
        <SkeletonRows rows={6} />
      </div>
    </div>
  );
}
