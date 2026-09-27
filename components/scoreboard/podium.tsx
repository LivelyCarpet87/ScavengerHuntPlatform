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
 *
 * While the hunt is live, phones get a compact podium (`compact`): players
 * check the board for their own place, so only the leader keeps a (smaller)
 * bib and 2nd and 3rd are single rows, leaving the next places on the first
 * screen. From `sm` up, and for the final results, it is the full podium.
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

/** The leader's bib on a phone during the hunt: rank and points on one row, then the team. */
const COMPACT_LEADER = {
  plate: "max-sm:mb-3 max-sm:px-4 max-sm:pt-4",
  rank: "max-sm:text-6xl",
  points: "max-sm:text-4xl",
  name: "max-sm:text-xl",
  avatar: "max-sm:size-9 max-sm:text-lg",
  team: "max-sm:mt-3",
};

/** 2nd and 3rd on a phone during the hunt: rows lined up with the list of everyone else. */
const COMPACT_ROW =
  "max-sm:col-span-2 max-sm:mt-0 max-sm:block max-sm:rounded-none max-sm:border-0 max-sm:border-b max-sm:border-line max-sm:p-0";

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
  compact = false,
}: {
  entries: PodiumEntry[];
  /** Attached to the viewer's bib, so the page knows when it scrolls out of view. */
  youRef?: (el: HTMLElement | null) => void;
  /** Phones get the compact podium (see above): pass while the hunt is on. */
  compact?: boolean;
}) {
  return (
    <ol
      aria-label="Top three"
      className={cn("grid grid-cols-2 gap-3 sm:grid-cols-[1.4fr_1.12fr_1fr] sm:gap-4", compact && "max-sm:gap-0")}
    >
      {entries.map((entry, i) => {
        const { row, tied, you, movement } = entry;
        const leader = i === 0;
        const size = PLACE[leader ? 1 : i === 1 ? 2 : 3];
        const lead = compact && leader ? COMPACT_LEADER : null;
        const asRow = compact && !leader;
        return (
          <li
            key={row.teamId}
            ref={you ? youRef : undefined}
            className={cn(
              "relative flex min-w-0 flex-col rounded-lg border-2 border-ink",
              you ? "bg-sun-wash" : "bg-paper",
              size.plate,
              lead?.plate,
              asRow && COMPACT_ROW,
            )}
          >
            {asRow ? <PodiumRow entry={entry} place={i + 1} className="sm:hidden" /> : null}
            <PinHoles className={cn(size.hole, asRow && "max-sm:hidden")} />
            <div className={cn("flex gap-x-4 gap-y-3 px-1", size.figures, asRow && "max-sm:hidden")}>
              <p className="flex items-start gap-2">
                <Ordinal n={row.rank ?? i + 1} className={cn("leading-[0.8]", size.rank, lead?.rank)} />
                <span className="sr-only">place</span>
                {tied ? <TieTag className="mt-1" /> : null}
                {movement ? <span className="mt-1">{movement}</span> : null}
                {you ? <YouTag className="mt-0.5" /> : null}
              </p>
              <p className="flex items-baseline gap-1.5">
                <span className={cn("font-bib leading-[0.85]", size.points, lead?.points)}>
                  {formatPoints(row.total)}
                </span>
                <span className="text-sm font-medium text-ink-2">points</span>
              </p>
            </div>
            <div className={cn("mt-4 flex min-w-0 px-1", size.team, lead?.team, asRow && "max-sm:hidden")}>
              <TeamAvatar team={row} size={size.avatar} className={lead?.avatar} />
              <p
                className={cn(
                  "min-w-0 font-cond leading-tight font-extrabold tracking-tight [overflow-wrap:anywhere]",
                  size.name,
                  lead?.name,
                )}
              >
                {row.name}
              </p>
            </div>
            <p className={cn("mt-2 px-1 text-sm text-ink-2", asRow && "max-sm:hidden")}>
              <Progress row={row} />
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/** 2nd or 3rd as one row, in the columns of the ranked list below it. */
function PodiumRow({ entry, place, className }: { entry: PodiumEntry; place: number; className?: string }) {
  const { row, tied, you, movement } = entry;
  return (
    <div className={cn("flex min-h-16 items-center gap-3 px-2 py-2.5", className)}>
      <div className="flex w-9 shrink-0 flex-col items-center">
        <Ordinal n={row.rank ?? place} className="text-3xl leading-none" />
        <span className="sr-only">place</span>
        {tied ? <TieTag className="mt-0.5 leading-none" /> : null}
      </div>
      <TeamAvatar team={row} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2">
          <span className="truncate font-cond text-lg leading-tight font-extrabold tracking-tight">{row.name}</span>
          {you ? <YouTag /> : null}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-sm text-ink-2">
          <span>{describeProgress(row)}</span>
          {movement}
        </p>
      </div>
      <span className="font-bib text-3xl leading-none tabular-nums">
        {formatPoints(row.total)}
        <span className="sr-only"> points</span>
      </span>
    </div>
  );
}
