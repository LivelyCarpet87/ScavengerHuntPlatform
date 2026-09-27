import { Fragment, type ReactNode } from "react";
import { Ordinal } from "@/components/ui/bib";
import { TeamAvatar } from "@/components/ui/team-badge";
import { formatPoints } from "@/lib/format";
import { describeProgress, type StandingRow } from "@/lib/live/types";
import { cn } from "@/lib/utils";

/*
 * The top three as race bibs pinned up at the finish line, in descending
 * size: the leader's bib is the biggest. Same paper plate, ink border and
 * four pin holes as the team dashboard's <Bib>.
 */

const PLACE = {
  1: {
    plate: "col-span-2 px-5 pt-5 pb-4 sm:col-span-1 sm:px-6 sm:pt-6",
    figures: "flex-row items-end justify-between sm:flex-col sm:items-start sm:justify-start",
    rank: "text-8xl",
    points: "text-5xl sm:text-6xl",
    name: "text-2xl",
    avatar: "lg",
    team: "flex-row items-center gap-2.5",
    hole: "size-2.5 border-2",
  },
  2: {
    // Margins against a stretched grid row keep the steps: every bib is
    // shorter than the one before it, whatever its content.
    plate: "px-4 pt-4 pb-3.5 sm:mt-10",
    figures: "flex-col",
    rank: "text-6xl",
    points: "text-4xl",
    name: "text-lg",
    avatar: "md",
    // Two bibs share a phone's width: the name gets the whole line under the avatar.
    team: "flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-2.5",
    hole: "size-2 border-[1.5px]",
  },
  3: {
    plate: "mt-8 px-4 pt-4 pb-3.5 sm:mt-20",
    figures: "flex-col",
    rank: "text-5xl",
    points: "text-3xl",
    name: "text-base",
    avatar: "md",
    team: "flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-2.5",
    hole: "size-2 border-[1.5px]",
  },
} as const;

/** "5 tasks, 1 contest place" that wraps between its parts, never inside one. */
export function Progress({ row }: { row: Pick<StandingRow, "solved" | "placements"> }) {
  const parts = describeProgress(row).split(", ");
  return parts.map((part, i) => (
    <Fragment key={part}>
      {i > 0 ? " " : null}
      <span className="whitespace-nowrap">
        {part}
        {i < parts.length - 1 ? "," : null}
      </span>
    </Fragment>
  ));
}

function PinHoles({ className }: { className: string }) {
  return (
    <>
      {["top-2 left-2", "top-2 right-2", "bottom-2 left-2", "bottom-2 right-2"].map((pos) => (
        <span key={pos} aria-hidden className={cn("absolute rounded-full border-ink-3 bg-mist", className, pos)} />
      ))}
    </>
  );
}

export function YouTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-xs bg-sun px-1.5 text-xs font-bold text-sun-ink",
        className,
      )}
    >
      You
    </span>
  );
}

export function TieTag({ className }: { className?: string }) {
  return <span className={cn("text-xs font-medium text-ink-3", className)}>tie</span>;
}

export type PodiumEntry = { row: StandingRow; tied: boolean; you: boolean; movement?: ReactNode };

export function Podium({
  entries,
  youRef,
}: {
  entries: PodiumEntry[];
  /** Attached to the viewer's bib, so the page knows when it scrolls out of view. */
  youRef?: (el: HTMLElement | null) => void;
}) {
  return (
    <ol aria-label="Top three" className="grid grid-cols-2 gap-3 sm:grid-cols-[1.4fr_1.12fr_1fr] sm:gap-4">
      {entries.map(({ row, tied, you, movement }, i) => {
        const size = PLACE[i === 0 ? 1 : i === 1 ? 2 : 3];
        return (
          <li
            key={row.teamId}
            ref={you ? youRef : undefined}
            className={cn(
              "relative flex min-w-0 flex-col rounded-lg border-2 border-ink",
              you ? "bg-sun-wash" : "bg-paper",
              size.plate,
            )}
          >
            <PinHoles className={size.hole} />
            <div className={cn("flex gap-x-4 gap-y-3 px-1", size.figures)}>
              <p className="flex items-start gap-2">
                <Ordinal n={row.rank ?? i + 1} className={cn("leading-[0.8]", size.rank)} />
                <span className="sr-only">place</span>
                {tied ? <TieTag className="mt-1" /> : null}
                {movement ? <span className="mt-1">{movement}</span> : null}
                {you ? <YouTag className="mt-0.5" /> : null}
              </p>
              <p className="flex items-baseline gap-1.5">
                <span className={cn("font-bib leading-[0.85]", size.points)}>{formatPoints(row.total)}</span>
                <span className="text-sm font-medium text-ink-2">points</span>
              </p>
            </div>
            <div className={cn("mt-4 flex min-w-0 px-1", size.team)}>
              <TeamAvatar team={row} size={size.avatar} />
              <p
                className={cn(
                  "min-w-0 font-cond leading-tight font-extrabold tracking-tight [overflow-wrap:anywhere]",
                  size.name,
                )}
              >
                {row.name}
              </p>
            </div>
            <p className="mt-2 px-1 text-sm text-ink-2">
              <Progress row={row} />
            </p>
          </li>
        );
      })}
    </ol>
  );
}
