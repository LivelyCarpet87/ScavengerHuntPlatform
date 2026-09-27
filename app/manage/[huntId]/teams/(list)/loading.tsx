import { Bone, LoadingLabel } from "@/components/staff/skeleton";

export default function TeamsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingLabel>Loading teams</LoadingLabel>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Bone className="h-10 w-32" />
          <Bone className="h-5 w-72 max-w-full" />
        </div>
        <Bone className="hidden h-11 w-36 md:block" />
      </div>
      <div className="divide-y divide-line rounded-lg border border-line">
        {["a", "b", "c", "d", "e"].map((k) => (
          <div key={k} className="flex items-center gap-4 px-4 py-3">
            <Bone className="h-7 w-8" />
            <Bone className="size-9 shrink-0 rounded-full" />
            <Bone className="h-5 flex-1" />
            <Bone className="hidden h-5 w-20 md:block" />
            <Bone className="h-8 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
