import { Bone, LoadingLabel } from "@/components/judge/skeleton";

/** Mirrors the judging workspace: queue, light table, decision panel. */
export default function JudgeLoading() {
  return (
    <div className="flex flex-col pb-28 lg:fixed lg:inset-y-0 lg:right-0 lg:left-64 lg:z-10 lg:bg-paper lg:pb-0">
      <LoadingLabel>Loading the judging queue</LoadingLabel>
      <div className="flex items-center gap-3 pb-3 lg:h-16 lg:shrink-0 lg:border-b lg:border-line lg:px-6 lg:pb-0">
        <Bone className="h-8 w-24" />
        <Bone className="h-6 w-20 rounded-full" />
        <div className="ml-auto hidden gap-2 lg:flex">
          <Bone className="h-10 w-44" />
          <Bone className="h-10 w-44" />
          <Bone className="h-10 w-44" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[6.25rem_minmax(0,1fr)_20rem] xl:grid-cols-[15rem_minmax(0,1fr)_21rem] 2xl:grid-cols-[18rem_minmax(0,1fr)_24rem]">
        <div className="-mx-4 flex gap-2 border-b border-line px-3 pt-1 pb-3 md:-mx-8 lg:mx-0 lg:flex-col lg:items-center lg:border-r lg:border-b-0 lg:p-2 xl:items-stretch xl:gap-0 xl:p-0">
          {Array.from({ length: 6 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
            <div key={i} className="flex shrink-0 gap-3 xl:border-b xl:border-line xl:px-4 xl:py-3">
              <Bone className="size-16 rounded-sm xl:size-14" />
              <div className="hidden flex-1 flex-col gap-2 xl:flex">
                <Bone className="h-5 w-40" />
                <Bone className="h-4 w-28" />
                <Bone className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
        <div className="-mx-4 bg-mist px-4 py-4 md:-mx-8 md:px-8 lg:mx-0 lg:px-6 lg:py-5">
          <div className="mb-4 flex items-center gap-3 lg:hidden">
            <Bone className="size-12 rounded-full bg-mist-2" />
            <Bone className="h-7 w-48 bg-mist-2" />
          </div>
          <Bone className="aspect-[4/3] w-full bg-mist-2 lg:aspect-auto lg:h-[calc(100dvh-15rem)]" />
          <div className="mt-4 flex gap-3">
            <Bone className="h-7 w-36 bg-mist-2" />
            <Bone className="h-7 w-24 bg-mist-2" />
          </div>
        </div>
        <div className="flex flex-col gap-5 py-5 lg:border-l lg:border-line lg:px-5">
          <div className="flex items-center gap-3">
            <Bone className="size-12 rounded-full" />
            <Bone className="h-7 w-48" />
          </div>
          <Bone className="h-24 w-full" />
          <Bone className="h-12 w-40" />
          <Bone className="h-28 w-full" />
        </div>
      </div>
    </div>
  );
}
