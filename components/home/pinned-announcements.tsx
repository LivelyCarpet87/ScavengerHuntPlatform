import { Pin } from "lucide-react";
import Link from "next/link";
import { RelativeTime } from "@/components/ui/countdown";
import { Markdown } from "@/components/ui/markdown";
import type { Announcement } from "@/lib/db/schema";

/** The organizers' pinned announcements (newest one or two), with a way into Updates. */
export function PinnedAnnouncements({
  items,
  updatesHref,
  now,
}: {
  items: Announcement[];
  updatesHref: string;
  now: number;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="pinned-heading">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="pinned-heading" className="font-cond text-2xl font-bold tracking-tight">
          From the organizers
        </h2>
        <Link href={updatesHref} className="shrink-0 text-sm font-semibold text-accent hover:underline">
          All updates
        </Link>
      </div>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {items.map((a) => (
          <li key={a.id} className="flex gap-3 py-3.5">
            <Pin aria-label="Pinned" className="mt-1 size-4 shrink-0 rotate-45 text-accent" />
            <div className="min-w-0 flex-1">
              {a.title ? <p className="font-semibold leading-snug">{a.title}</p> : null}
              <Markdown className={a.title ? "mt-0.5 text-[0.9375rem] text-ink-2" : "text-[0.9375rem]"}>
                {a.body}
              </Markdown>
              <RelativeTime at={a.createdAt.getTime()} serverNow={now} className="mt-1 block text-xs text-ink-3" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
