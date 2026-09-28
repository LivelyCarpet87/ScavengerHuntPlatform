import { Archive, Download, Images, MonitorPlay, Trophy } from "lucide-react";
import Link from "next/link";
import type { Hunt } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { DuplicateHuntButton } from "./duplicate-hunt-button";

/**
 * Replaces the join-code panel once a hunt is over: the join code no longer
 * matters, but the prize-giving, the photos and the results do.
 */
export function WrapUpPanel({
  hunt,
  organizer,
  className,
}: {
  hunt: Pick<Hunt, "id" | "name" | "slug" | "status" | "galleryMode">;
  organizer: boolean;
  className?: string;
}) {
  const link =
    "flex min-h-11 items-center gap-3 rounded-md px-2 py-2 text-[0.9375rem] font-semibold text-ink hover:bg-mist [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-2";
  const exportBase = `/api/hunts/${hunt.id}/export`;
  return (
    <section aria-labelledby="wrap-heading" className={cn("rounded-lg border border-line p-5", className)}>
      <h2 id="wrap-heading" className="font-cond text-xl font-bold">
        {hunt.status === "archived" ? "After the hunt" : "Wrap up"}
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        {hunt.status === "archived"
          ? "Results, photos and exports stay here for as long as you keep the hunt."
          : "The hunt is over. Reveal the winners, share the photos and keep a copy of the results."}
      </p>
      <ul className="mt-3 flex flex-col">
        <li>
          <Link href={`/h/${hunt.slug}/screen`} target="_blank" className={link}>
            <MonitorPlay aria-hidden />
            Show the results on the big screen
          </Link>
        </li>
        <li>
          <Link href={`/manage/${hunt.id}/scoreboard`} className={link}>
            <Trophy aria-hidden />
            Final scoreboard
          </Link>
        </li>
        {hunt.galleryMode !== "off" ? (
          <li>
            <Link href={`/h/${hunt.slug}/gallery`} className={link}>
              <Images aria-hidden />
              Photo gallery
            </Link>
          </li>
        ) : null}
        <li>
          <a href={`${exportBase}/standings.csv`} className={link}>
            <Download aria-hidden />
            Download the results (CSV)
          </a>
        </li>
        <li>
          <a href={`${exportBase}/media.zip`} className={link}>
            <Download aria-hidden />
            Download the photos (ZIP)
          </a>
        </li>
      </ul>
      {organizer ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <DuplicateHuntButton huntId={hunt.id} huntName={hunt.name} variant="secondary" label="Run it again" />
          {hunt.status !== "archived" ? (
            <Link
              href={`/manage/${hunt.id}/settings#status`}
              className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-ink hover:bg-mist [&_svg]:size-4"
            >
              <Archive aria-hidden />
              Archive it
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
