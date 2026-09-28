import { Megaphone, Pin } from "lucide-react";
import Link from "next/link";
import { ControlMarker } from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/countdown";
import { Markdown } from "@/components/ui/markdown";
import { StatusBadge } from "@/components/ui/status";
import { formatPoints } from "@/lib/format";
import { links } from "@/lib/url";
import { NewMark } from "./updates-seen";

export type FeedItem =
  | {
      kind: "announcement";
      id: string;
      at: number;
      pinned: boolean;
      title: string | null;
      body: string;
    }
  | {
      kind: "result";
      id: string;
      at: number;
      status: "approved" | "rejected";
      task: { id: string; code: number; title: string; contestUnit: string | null; isContest: boolean };
      feedback: string | null;
      /** Points this decision earned the team, when it's the one that counts. */
      points: number | null;
      contestValue: number | null;
      /** The team can send another try right now (hunt running, task open, tries left). */
      canRetry: boolean;
      /** Players can open the task (it wasn't hidden again). */
      linkable: boolean;
    };

/** Announcements and the team's judged results, as one list. */
export function UpdatesFeed({ items, slug, now }: { items: FeedItem[]; slug: string; now: number }) {
  return (
    <ol className="divide-y divide-line border-y border-line">
      {items.map((item) => (
        <li key={`${item.kind}:${item.id}`} className="relative flex gap-3.5 py-4">
          {item.kind === "announcement" ? (
            <AnnouncementItem item={item} now={now} />
          ) : (
            <ResultItem item={item} slug={slug} now={now} />
          )}
        </li>
      ))}
    </ol>
  );
}

function AnnouncementItem({ item, now }: { item: Extract<FeedItem, { kind: "announcement" }>; now: number }) {
  return (
    <>
      {/* Plain ink on mist: the overprint color stays for the course (control markers), "New" and actions. */}
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-mist text-ink-2">
        <Megaphone aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h2 className="font-semibold leading-snug break-words">{item.title ?? "From the organizers"}</h2>
          {item.pinned ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-2">
              <Pin aria-hidden className="size-3.5 rotate-45" />
              Pinned
            </span>
          ) : null}
          <NewMark at={item.at} />
        </div>
        <Markdown className="mt-1 text-[0.9375rem]">{item.body}</Markdown>
        <RelativeTime at={item.at} serverNow={now} className="mt-2 block text-xs text-ink-3" />
      </div>
    </>
  );
}

function ResultItem({ item, slug, now }: { item: Extract<FeedItem, { kind: "result" }>; slug: string; now: number }) {
  const accepted = item.status === "approved";
  return (
    <>
      <ControlMarker
        code={item.task.code}
        state={item.status}
        size="sm"
        className="mt-0.5"
        label={`Control ${item.task.code}, ${accepted ? "accepted" : "not accepted"}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <StatusBadge status={item.status} />
          {accepted && item.points != null ? (
            <span className="font-bib text-lg leading-none">
              +{formatPoints(item.points)}
              <span className="sr-only"> points</span>
            </span>
          ) : null}
          <NewMark at={item.at} />
        </div>
        <h2 className="mt-1.5 font-semibold leading-snug break-words">
          {item.linkable ? (
            <Link href={links.task(slug, item.task.id)} className="underline-offset-2 hover:underline">
              {item.task.title}
            </Link>
          ) : (
            item.task.title
          )}
        </h2>
        {item.task.isContest && accepted && item.contestValue != null ? (
          <p className="mt-0.5 text-sm text-ink-2">
            Recorded{" "}
            <span className="font-bib text-base text-ink">
              {formatPoints(item.contestValue)}
              {item.task.contestUnit ? ` ${item.task.contestUnit}` : ""}
            </span>
          </p>
        ) : null}
        {item.feedback ? (
          <blockquote className="mt-2 border-l-4 border-line-strong pl-3 text-[0.9375rem] break-words text-ink">
            <span className="sr-only">Judge’s note: </span>“{item.feedback}”
          </blockquote>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
          <RelativeTime at={item.at} serverNow={now} />
          {!accepted && item.canRetry ? (
            <Link
              href={links.task(slug, item.task.id)}
              className="text-sm font-semibold text-ink underline underline-offset-2 hover:text-ink-2"
            >
              Open the task to try again
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}
