import { Skeleton } from "@/components/home/skeleton";
import { PageHeader } from "@/components/ui/misc";

/** Updates skeleton: the heading and a few feed items. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Updates"
        description="Announcements from the organizers, and what the judges decided on your team’s proof."
      />
      <output className="sr-only">Loading updates</output>
      <ul aria-hidden className="divide-y divide-line border-y border-line">
        {["w-3/5", "w-2/5", "w-1/2", "w-2/3"].map((w) => (
          <li key={w} className="flex gap-3.5 py-4">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2.5">
              <Skeleton className={`h-5 ${w}`} />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-16" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
