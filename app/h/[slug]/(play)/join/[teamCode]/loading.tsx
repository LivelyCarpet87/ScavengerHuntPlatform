import { Skeleton } from "@/components/home/skeleton";

/** Team invite skeleton: the team's emblem and name, then the name field. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-10">
      <output className="sr-only">Loading the team invite</output>
      <div
        aria-hidden
        className="-mx-4 -mt-5 flex flex-col items-center gap-4 border-b border-line px-4 pt-10 pb-8 sm:mx-0 sm:mt-0 sm:rounded-xl sm:border"
      >
        <Skeleton className="h-5 w-44" />
        <Skeleton className="size-24 rounded-full" />
        <Skeleton className="h-12 w-60 max-w-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div aria-hidden className="flex w-full flex-col gap-3 sm:max-w-md">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}
