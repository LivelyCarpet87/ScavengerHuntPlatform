import { Bone, LoadingLabel } from "@/components/staff/skeleton";

export default function AnnouncementsLoading() {
  return (
    <div className="flex flex-col gap-8">
      <LoadingLabel>Loading announcements</LoadingLabel>
      <div className="flex flex-col gap-2">
        <Bone className="h-10 w-64" />
        <Bone className="h-5 w-96 max-w-full" />
      </div>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="flex flex-col gap-5">
          <Bone className="h-8 w-52" />
          <Bone className="h-12" />
          <Bone className="h-36" />
          <Bone className="h-14 w-56" />
        </div>
        <div className="flex flex-col gap-4">
          <Bone className="h-8 w-20" />
          <Bone className="h-32 rounded-lg" />
          <Bone className="h-24 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
