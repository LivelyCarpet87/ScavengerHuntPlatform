"use client";

import { Clock, Eye, Film, Quote } from "lucide-react";
import { memo } from "react";
import { ControlMarker } from "@/components/ui/control";
import { Spinner } from "@/components/ui/spinner";
import { TeamAvatar } from "@/components/ui/team-badge";
import { formatDuration } from "@/lib/format";
import { firstName } from "@/lib/judging/labels";
import type { Claim, JudgeTask, JudgeTeam, QueueItem } from "@/lib/judging/types";
import { cn } from "@/lib/utils";
import { Img } from "./img";

/** Waiting longer than this turns the wait yellow. */
const SLOW_MS = 10 * 60_000;
/** Waiting longer than this is overdue: red, a clock glyph and the word (never color alone). */
const OVERDUE_MS = 20 * 60_000;

export function waitLabel(ms: number): string {
  return ms < 60_000 ? "just in" : formatDuration(ms);
}

function Thumb({ item, className }: { item: QueueItem; className?: string }) {
  const file = item.files[0];
  if (file && (file.kind === "image" || file.poster)) {
    return (
      <span className={cn("relative block overflow-hidden rounded-sm bg-mist-2", className)}>
        <Img src={file.thumb} alt="" className="size-full object-cover" />
        {/* Bottom-left: the team avatar sits over the bottom-right corner. */}
        {file.kind === "video" ? (
          <span className="absolute bottom-1 left-1 grid size-5 place-items-center rounded-full bg-ink/75 text-paper">
            <Film className="size-3" aria-hidden />
          </span>
        ) : null}
        {item.files.length > 1 ? (
          <span className="absolute top-1 right-1 rounded-full bg-ink/75 px-1.5 font-bib text-[0.7rem] leading-4 text-paper">
            {item.files.length}
          </span>
        ) : null}
      </span>
    );
  }
  if (file?.kind === "video") {
    return (
      <span className={cn("grid place-items-center rounded-sm bg-mist-2 text-ink-2", className)}>
        <Film className="size-5" aria-hidden />
      </span>
    );
  }
  return (
    <span className={cn("flex flex-col items-start justify-between rounded-sm bg-mist-2 p-1.5 text-ink-2", className)}>
      <Quote className="size-3.5" aria-hidden />
      <span className="line-clamp-2 w-full text-left text-[0.7rem] leading-tight font-semibold break-words text-ink">
        {item.text ?? ""}
      </span>
    </span>
  );
}

export const QueueList = memo(function QueueList({
  items,
  selectedId,
  onSelect,
  tasks,
  teams,
  claimOf,
  reviewing,
  now,
  fresh,
  skipped,
  more,
  className,
}: {
  items: QueueItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  tasks: Record<string, JudgeTask>;
  teams: Record<string, JudgeTeam>;
  claimOf: (item: QueueItem) => Claim | null;
  /** Submissions another judge has open right now. */
  reviewing: ReadonlySet<string>;
  now: number;
  /** Items that arrived while the queue was open. */
  fresh: ReadonlySet<string>;
  skipped: ReadonlySet<string>;
  /** More submissions wait past the loaded ones: how many, and loading the next batch. */
  more: { waiting: number; next: number; onMore: () => void; loading: boolean } | null;
  className?: string;
}) {
  return (
    <ol
      aria-label="Waiting submissions, oldest first"
      className={cn(
        "flex gap-1 overflow-x-auto px-3 pt-1 pb-3 [scrollbar-width:thin]",
        "lg:flex-col lg:items-center lg:gap-1 lg:overflow-visible lg:px-2 lg:py-2",
        "xl:items-stretch xl:gap-0 xl:p-0",
        className,
      )}
    >
      {items.map((item, index) => {
        const task = tasks[item.taskId];
        const team = teams[item.teamId];
        if (!task || !team) return null;
        const selected = item.id === selectedId;
        const claim = claimOf(item);
        const claimedByOther = reviewing.has(item.id);
        const waited = Math.max(0, now - item.createdAt);
        const wait = waitLabel(waited);
        const slow = waited >= SLOW_MS;
        const overdue = waited >= OVERDUE_MS;
        const isNew = fresh.has(item.id);
        const label = [
          `${task.code} ${task.title}`,
          team.name,
          waited < 60_000 ? "just sent" : overdue ? `overdue, waiting ${wait}` : `waiting ${wait}`,
          isNew ? "new" : null,
          claimedByOther ? `${firstName(claim?.name)} is reviewing` : null,
          skipped.has(item.id) ? "skipped" : null,
        ]
          .filter(Boolean)
          .join(", ");
        return (
          <li key={item.id} className="shrink-0 xl:shrink">
            <button
              type="button"
              data-queue-id={item.id}
              // Roving focus: only the open submission is a tab stop; J/K and ↑/↓ move within the queue.
              tabIndex={selected || (!selectedId && index === 0) ? 0 : -1}
              onClick={() => onSelect(item.id)}
              aria-current={selected ? "true" : undefined}
              aria-label={label}
              title={label}
              className={cn(
                // Phones: when the next submission opens, the strip scrolls back into view below the sticky header.
                "group relative flex w-[4.75rem] flex-col items-center gap-1.5 rounded-md p-1.5 text-center transition-colors hover:bg-mist max-lg:scroll-mt-20",
                "xl:w-full xl:flex-row xl:items-start xl:gap-3 xl:rounded-none xl:border-b xl:border-line xl:px-4 xl:py-3 xl:text-left",
                selected && "bg-mist xl:bg-paper xl:shadow-[inset_4px_0_0_var(--accent)]",
              )}
            >
              <span className="relative shrink-0">
                <Thumb
                  item={item}
                  className={cn(
                    "size-16 xl:size-14",
                    selected && "ring-3 ring-accent ring-offset-2 ring-offset-paper xl:ring-0",
                    claimedByOther && "opacity-55",
                  )}
                />
                {claimedByOther ? (
                  // Someone else has it open: an eye over the photo (the full row also says who).
                  <span aria-hidden className="absolute inset-0 grid place-items-center">
                    <span className="grid size-7 place-items-center rounded-full bg-paper text-water ring-2 ring-water">
                      <Eye className="size-4" />
                    </span>
                  </span>
                ) : null}
                <ControlMarker
                  code={task.code}
                  state="pending"
                  size="sm"
                  label={`Control ${task.code}`}
                  className="absolute -top-2 -left-2 size-7"
                />
                <TeamAvatar
                  team={team}
                  size="sm"
                  className="absolute -right-1.5 -bottom-1.5 size-6 text-xs ring-2 ring-paper"
                />
              </span>

              {/* Rail and strip caption */}
              <span
                className={cn(
                  "flex items-center gap-0.5 text-xs leading-none font-semibold whitespace-nowrap xl:hidden",
                  overdue ? "text-danger" : slow ? "text-sun-fg" : "text-ink-2",
                )}
              >
                {overdue ? <Clock aria-hidden className="size-3 shrink-0" /> : null}
                {wait}
              </span>

              {/* Full row (wide screens) */}
              <span className="hidden min-w-0 flex-1 flex-col gap-0.5 xl:flex">
                <span className="line-clamp-2 text-[0.9375rem] leading-snug font-semibold">{task.title}</span>
                <span className="truncate text-sm text-ink-2">{team.name}</span>
                <span className="flex items-center gap-2 text-xs">
                  {claimedByOther ? (
                    <span className="flex items-center gap-1 font-semibold text-water">
                      <Eye className="size-3.5" aria-hidden />
                      {firstName(claim?.name)} is reviewing
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "flex items-center gap-1 font-semibold",
                        overdue ? "text-danger" : slow ? "text-sun-fg" : "text-ink-3",
                      )}
                    >
                      {overdue ? <Clock aria-hidden className="size-3.5 shrink-0" /> : null}
                      {waited < 60_000 ? "Just in" : overdue ? `Overdue · ${wait}` : `Waiting ${wait}`}
                    </span>
                  )}
                  {isNew ? (
                    <span className="rounded-full bg-sun px-1.5 py-0.5 text-[0.7rem] leading-none font-bold text-sun-ink">
                      New
                    </span>
                  ) : null}
                  {skipped.has(item.id) ? <span className="text-ink-3">Skipped</span> : null}
                </span>
              </span>
              {isNew ? (
                <span
                  aria-hidden
                  className="absolute top-1 right-1 size-2.5 rounded-full bg-sun ring-2 ring-paper xl:hidden"
                />
              ) : null}
            </button>
          </li>
        );
      })}
      {more ? (
        <li className="shrink-0 xl:shrink">
          <button
            type="button"
            onClick={more.onMore}
            disabled={more.loading}
            aria-label={`Show ${more.next} more of the ${more.waiting} still waiting`}
            className={cn(
              "flex size-[4.75rem] flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-line-strong text-center text-ink-2 hover:border-ink-3 hover:text-ink",
              "xl:h-auto xl:w-full xl:flex-row xl:justify-start xl:gap-2 xl:rounded-none xl:border-0 xl:border-b xl:border-line xl:px-4 xl:py-3 xl:text-left xl:hover:bg-mist",
            )}
          >
            {more.loading ? <Spinner className="size-4" /> : null}
            {/* Rail and strip: "+487 more". Wide rows: "Show 40 more · 487 still waiting". */}
            <span className="font-bib text-lg leading-none text-ink xl:hidden">+{more.waiting}</span>
            <span className="text-xs font-semibold xl:hidden">more</span>
            <span className="hidden text-sm font-semibold text-ink xl:inline">Show {more.next} more</span>
            <span className="hidden text-sm text-ink-2 xl:inline">{more.waiting} still waiting</span>
          </button>
        </li>
      ) : null}
    </ol>
  );
});
