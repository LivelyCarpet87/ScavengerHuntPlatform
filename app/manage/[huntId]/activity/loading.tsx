import { Bone, LoadingLabel } from "@/components/judge/skeleton";

export default function ActivityLoading() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingLabel>Loading activity</LoadingLabel>
      <div className="flex flex-col gap-2">
        <Bone className="h-9 w-40" />
        <Bone className="h-5 w-96 max-w-full" />
      </div>
      <div className="flex gap-3 border-b border-line pb-3">
        {["w-24", "w-16", "w-14", "w-14", "w-12", "w-16"].map((w, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          <Bone key={i} className={`h-6 ${w}`} />
        ))}
      </div>
      <Bone className="h-6 w-20" />
      <ol className="divide-y divide-line">
        {Array.from({ length: 8 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          <li key={i} className="flex gap-3 py-3">
            <Bone className="size-8 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Bone className="h-5 w-3/4" />
              <Bone className="h-3 w-24" />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
