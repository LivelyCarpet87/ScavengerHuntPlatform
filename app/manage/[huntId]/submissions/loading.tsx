import { Bone, LoadingLabel } from "@/components/judge/skeleton";

export default function SubmissionsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingLabel>Loading submissions</LoadingLabel>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Bone className="h-9 w-56" />
          <Bone className="h-5 w-80 max-w-full" />
        </div>
        <Bone className="h-11 w-40" />
      </div>
      <div className="flex gap-3 border-b border-line pb-3">
        <Bone className="h-6 w-14" />
        <Bone className="h-6 w-24" />
        <Bone className="h-6 w-24" />
        <Bone className="h-6 w-28" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_auto]">
        <Bone className="h-12" />
        <Bone className="h-12" />
        <Bone className="h-12 sm:col-span-2 lg:col-span-1" />
        <Bone className="h-12 w-24" />
      </div>
      <ul className="divide-y divide-line">
        {Array.from({ length: 8 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          <li key={i} className="flex items-center gap-3 px-3 py-3">
            <Bone className="size-14 shrink-0 rounded-sm" />
            <div className="flex flex-1 flex-col gap-2">
              <Bone className="h-5 w-40" />
              <Bone className="h-4 w-56 max-w-full" />
            </div>
            <Bone className="h-6 w-20 rounded-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}
