import { Bone, LoadingLabel } from "../skeleton";

/** Loading state for the task editor routes. */
export function TaskEditorSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingLabel>Loading the task editor</LoadingLabel>
      <Bone className="h-5 w-24" />
      <div className="flex items-center gap-4">
        <Bone className="size-[72px] rounded-full" />
        <div className="flex flex-col gap-2">
          <Bone className="h-10 w-64 max-w-full" />
          <Bone className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-x-10 gap-y-12 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          <Bone className="h-8 w-24" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {["a", "b", "c", "d"].map((k) => (
              <Bone key={k} className="h-20 rounded-lg" />
            ))}
          </div>
          <Bone className="mt-6 h-8 w-28" />
          <div className="grid gap-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <Bone className="h-12" />
            <Bone className="h-12" />
          </div>
          <Bone className="h-36" />
        </div>
        <div className="flex flex-col gap-4">
          <Bone className="h-8 w-20" />
          <Bone className="h-32 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
