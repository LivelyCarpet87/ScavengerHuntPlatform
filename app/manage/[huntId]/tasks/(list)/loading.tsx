import { Bone, LoadingLabel } from "@/components/staff/skeleton";

export default function TasksLoading() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingLabel>Loading tasks</LoadingLabel>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Bone className="h-10 w-32" />
          <Bone className="h-5 w-80 max-w-full" />
        </div>
        <Bone className="hidden h-11 w-32 md:block" />
      </div>
      <div className="divide-y divide-line rounded-lg border border-line">
        {["a", "b", "c", "d", "e", "f"].map((k) => (
          <div key={k} className="flex items-center gap-4 px-4 py-3">
            <Bone className="size-12 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Bone className="h-5 w-48 max-w-full" />
              <Bone className="h-4 w-28" />
            </div>
            <Bone className="hidden h-9 w-24 md:block" />
            <Bone className="hidden h-9 w-20 md:block" />
            <Bone className="h-11 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
