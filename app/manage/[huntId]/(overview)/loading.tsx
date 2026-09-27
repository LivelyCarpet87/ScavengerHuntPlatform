import { Bone, LoadingLabel } from "@/components/staff/skeleton";

/** Matches the overview: map header, then checklist/live panel beside the share panel. */
export default function OverviewLoading() {
  return (
    <div className="flex flex-col gap-8">
      <LoadingLabel>Loading the hunt overview</LoadingLabel>
      <div className="overflow-hidden rounded-xl border border-line">
        <Bone className="h-28 rounded-none sm:h-36" />
        <div className="flex flex-wrap items-end justify-between gap-6 p-5 sm:p-6">
          <div className="flex flex-col gap-3">
            <Bone className="h-6 w-48" />
            <Bone className="h-12 w-72 max-w-full" />
            <Bone className="h-5 w-64 max-w-full" />
          </div>
          <div className="flex flex-col items-end gap-4">
            <Bone className="h-14 w-40" />
            <Bone className="h-11 w-48" />
          </div>
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex flex-col gap-4">
          <Bone className="h-8 w-36" />
          <div className="divide-y divide-line rounded-lg border border-line">
            {["a", "b", "c", "d", "e"].map((k) => (
              <div key={k} className="flex items-center gap-4 p-4">
                <Bone className="size-8 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Bone className="h-5 w-44" />
                  <Bone className="h-4 w-64 max-w-full" />
                </div>
                <Bone className="hidden h-9 w-24 sm:block" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4 rounded-lg border border-line p-5">
          <Bone className="h-7 w-28" />
          <Bone className="h-14 w-52" />
          <div className="flex gap-4">
            <Bone className="size-32" />
            <div className="flex flex-col gap-2">
              <Bone className="h-9 w-28" />
              <Bone className="h-9 w-24" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
