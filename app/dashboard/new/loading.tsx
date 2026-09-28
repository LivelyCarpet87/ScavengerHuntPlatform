import { SiteHeader } from "@/components/shells/site-header";
import { Bone, LoadingLabel } from "@/components/staff/skeleton";

export default function NewHuntLoading() {
  return (
    <>
      <SiteHeader>
        <Bone className="h-9 w-36" />
      </SiteHeader>
      <main className="mx-auto max-w-6xl px-4 pt-6 pb-16">
        <LoadingLabel>Loading the new hunt form</LoadingLabel>
        <Bone className="h-5 w-24" />
        <Bone className="mt-5 h-12 w-60" />
        <Bone className="mt-3 mb-8 h-5 w-80" />
        <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-6">
            <Bone className="h-8 w-44" />
            <Bone className="h-12" />
            <Bone className="h-12" />
            <Bone className="mt-4 h-8 w-24" />
            <div className="grid gap-5 sm:grid-cols-2">
              <Bone className="h-12" />
              <Bone className="h-12" />
            </div>
          </div>
          <Bone className="order-first h-52 rounded-lg lg:order-last" />
        </div>
      </main>
    </>
  );
}
