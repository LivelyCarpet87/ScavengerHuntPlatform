import { Bone, LoadingLabel } from "@/components/staff/skeleton";

export default function SettingsLoading() {
  return (
    <div className="flex flex-col">
      <LoadingLabel>Loading settings</LoadingLabel>
      <Bone className="h-10 w-40" />
      <Bone className="mt-3 h-5 w-80 max-w-full" />
      <div className="mt-6 mb-4 flex gap-1.5">
        {["a", "b", "c", "d", "e"].map((k) => (
          <Bone key={k} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      {["s1", "s2"].map((k) => (
        <div key={k} className="grid gap-5 border-t border-line py-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
          <div className="flex flex-col gap-2">
            <Bone className="h-8 w-32" />
            <Bone className="h-4 w-48" />
          </div>
          <div className="flex max-w-2xl flex-col gap-5">
            <Bone className="h-12" />
            <Bone className="h-12" />
            <Bone className="h-32" />
          </div>
        </div>
      ))}
    </div>
  );
}
