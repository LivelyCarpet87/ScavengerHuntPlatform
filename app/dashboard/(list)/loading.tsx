import { SiteHeader } from "@/components/shells/site-header";
import { Bone, LoadingLabel } from "@/components/staff/skeleton";

export default function DashboardLoading() {
  return (
    <>
      <SiteHeader>
        <Bone className="h-9 w-36" />
      </SiteHeader>
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pt-8 pb-16">
        <LoadingLabel>Loading your hunts</LoadingLabel>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-3">
            <Bone className="h-11 w-56" />
            <Bone className="h-5 w-72" />
          </div>
          <Bone className="hidden h-11 w-32 md:block" />
        </div>
        <div className="flex flex-col gap-4">
          <Bone className="h-7 w-32" />
          <div className="overflow-hidden rounded-xl border border-line md:grid md:grid-cols-[5fr_7fr]">
            <Bone className="h-36 rounded-none md:h-64" />
            <div className="flex flex-col gap-4 p-6">
              <Bone className="h-6 w-16 rounded-full" />
              <Bone className="h-10 w-3/4" />
              <div className="flex gap-8">
                <Bone className="h-10 w-12" />
                <Bone className="h-10 w-12" />
                <Bone className="h-10 w-12" />
              </div>
              <Bone className="h-9 w-64" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Bone className="h-7 w-48" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {["a", "b", "c"].map((k) => (
              <div key={k} className="overflow-hidden rounded-lg border border-line">
                <Bone className="h-24 rounded-none" />
                <div className="flex flex-col gap-3 p-4">
                  <Bone className="h-7 w-2/3" />
                  <Bone className="h-4 w-1/2" />
                  <Bone className="h-9 w-32" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
