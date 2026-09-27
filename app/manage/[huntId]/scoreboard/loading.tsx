import { Bone, LoadingLabel } from "@/components/judge/skeleton";

export default function ScoreboardLoading() {
  return (
    <div className="flex flex-col gap-10">
      <LoadingLabel>Loading the scoreboard</LoadingLabel>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Bone className="h-9 w-52" />
          <Bone className="h-5 w-96 max-w-full" />
        </div>
        <Bone className="h-11 w-36" />
      </div>
      <div className="flex flex-col gap-3">
        <Bone className="h-7 w-32" />
        <ol className="divide-y divide-line border-y border-line">
          {Array.from({ length: 6 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
            <li key={i} className="flex items-center gap-3 px-3 py-3">
              <Bone className="h-7 w-10" />
              <Bone className="size-7 rounded-full" />
              <Bone className="h-5 w-40" />
              <Bone className="ml-auto h-8 w-16" />
            </li>
          ))}
        </ol>
      </div>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Bone className="h-96 w-full rounded-lg" />
        <div className="flex flex-col gap-3">
          <Bone className="h-7 w-24" />
          {Array.from({ length: 6 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
            <Bone key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
