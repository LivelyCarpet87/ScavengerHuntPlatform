import { Bone, LoadingLabel } from "@/components/judge/skeleton";

export default function SubmissionLoading() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingLabel>Loading the submission</LoadingLabel>
      <Bone className="h-5 w-36" />
      <div className="flex items-start gap-4">
        <Bone className="size-14 rounded-full sm:size-[72px]" />
        <div className="flex flex-1 flex-col gap-2">
          <Bone className="h-10 w-72 max-w-full" />
          <Bone className="h-7 w-56" />
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-6">
          <Bone className="aspect-[4/3] w-full rounded-xl" />
          <div className="flex flex-col gap-3">
            <Bone className="h-7 w-32" />
            <Bone className="h-5 w-full" />
            <Bone className="h-5 w-4/5" />
            <Bone className="h-5 w-3/5" />
          </div>
        </div>
        <div className="flex flex-col gap-4 rounded-lg border border-line p-5">
          <Bone className="h-7 w-40" />
          <Bone className="h-12 w-32" />
          <Bone className="h-24 w-full" />
          <Bone className="h-14 w-full" />
        </div>
      </div>
    </div>
  );
}
