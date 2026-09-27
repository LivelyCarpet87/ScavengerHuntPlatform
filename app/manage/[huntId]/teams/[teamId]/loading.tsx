import { Bone, LoadingLabel } from "@/components/staff/skeleton";

export default function TeamLoading() {
  return (
    <div className="flex flex-col gap-8">
      <LoadingLabel>Loading the team</LoadingLabel>
      <Bone className="h-5 w-24" />
      <div className="flex items-center gap-4">
        <Bone className="size-20 rounded-full" />
        <div className="flex flex-col gap-2">
          <Bone className="h-10 w-56" />
          <Bone className="h-4 w-40" />
        </div>
      </div>
      <Bone className="h-[5.25rem] rounded-lg" />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-3">
          <Bone className="h-8 w-32" />
          <Bone className="h-40 rounded-lg" />
        </div>
        <Bone className="h-56 rounded-lg" />
      </div>
    </div>
  );
}
