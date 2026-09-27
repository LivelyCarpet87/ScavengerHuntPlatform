"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useOptimistic, useTransition } from "react";
import { Ordinal } from "@/components/ui/bib";
import { TeamAvatar } from "@/components/ui/team-badge";
import { formatPoints, formatSigned, ordinal } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Bone } from "./skeleton";
import { STANDINGS_GRID, STANDINGS_GRID_FROZEN } from "./standings-grid";

/** One team's summary, as plain data: the live board re-sends every row on each update. */
export type StandingsListRow = {
  teamId: string;
  name: string;
  emoji: string;
  color: string;
  /** Null when no rank is shown (hidden teams, or nobody has scored yet). */
  rank: number | null;
  total: number;
  solved: number;
  taskPoints: number;
  contestPoints: number;
  hintPenalty: number;
  adjustmentPoints: number;
  /** While the board is frozen: what players see, e.g. "3rd with 400"; null when it isn't frozen. */
  players: { text: string; same: boolean } | null;
};

function Signed({ value }: { value: number }) {
  return <span className={cn(value === 0 && "text-ink-3")}>{value === 0 ? "–" : formatSigned(value)}</span>;
}

/**
 * Standings rows that each open the team's score breakdown underneath. Only
 * the open team's breakdown is rendered on the server (it's in the URL as
 * ?team=), so the page stays small however many teams play; a row opens at
 * once and shows a placeholder until its breakdown arrives.
 */
export function StandingsList({
  rows,
  frozen,
  openTeamId,
  path,
  keep,
  breakdown,
  className,
}: {
  rows: StandingsListRow[];
  frozen: boolean;
  /** The team whose breakdown the server rendered (`breakdown`), if it's in this list. */
  openTeamId: string | null;
  /** The scoreboard's path, and search params to keep when a row opens or closes. */
  path: string;
  keep: Record<string, string>;
  breakdown: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [shownId, setShownId] = useOptimistic(openTeamId);
  const grid = frozen ? STANDINGS_GRID_FROZEN : STANDINGS_GRID;

  const toggle = (teamId: string) =>
    startTransition(() => {
      const next = shownId === teamId ? null : teamId;
      setShownId(next);
      const params = new URLSearchParams(keep);
      if (next) params.set("team", next);
      else params.delete("team");
      const qs = params.toString();
      router.replace(`${path}${qs ? `?${qs}` : ""}`, { scroll: false });
    });

  return (
    <ol className={className}>
      {rows.map((r) => {
        const shown = shownId === r.teamId;
        const panelId = `breakdown-${r.teamId}`;
        const label = [
          r.rank != null ? ordinal(r.rank) : null,
          r.name,
          `${formatPoints(r.total)} ${Math.abs(r.total) === 1 ? "point" : "points"}`,
          r.players && !r.players.same ? `players see ${r.players.text}` : null,
        ]
          .filter(Boolean)
          .join(", ");
        return (
          <li key={r.teamId} id={`team-${r.teamId}`} className="scroll-mt-24">
            <button
              type="button"
              onClick={() => toggle(r.teamId)}
              aria-expanded={shown}
              aria-controls={shown ? panelId : undefined}
              aria-label={label}
              className={cn(
                "grid w-full cursor-pointer grid-cols-[2.75rem_minmax(0,1fr)_auto_1.25rem] items-center gap-x-3 px-3 py-3 text-left transition-colors hover:bg-mist",
                grid,
              )}
            >
              <span className="text-2xl leading-none">
                {r.rank != null ? <Ordinal n={r.rank} /> : <span className="font-bib text-ink-3">–</span>}
              </span>
              <span className="flex min-w-0 items-center gap-2.5">
                <TeamAvatar team={r} size="sm" />
                <span className="truncate font-semibold">{r.name}</span>
              </span>
              <span className="hidden text-right font-bib text-lg lg:block">{r.solved}</span>
              <span className="hidden text-right font-bib text-lg lg:block">{formatPoints(r.taskPoints)}</span>
              <span className="hidden text-right font-bib text-lg lg:block">
                {r.contestPoints ? formatPoints(r.contestPoints) : <span className="text-ink-3">–</span>}
              </span>
              <span className="hidden text-right font-bib text-lg lg:block">
                <Signed value={-r.hintPenalty} />
              </span>
              <span className="hidden text-right font-bib text-lg lg:block">
                <Signed value={r.adjustmentPoints} />
              </span>
              <span className="text-right font-bib text-3xl leading-none">{formatPoints(r.total)}</span>
              {frozen ? (
                <span
                  className={cn(
                    "hidden text-right text-sm lg:block",
                    !r.players || r.players.same ? "text-ink-3" : "font-semibold text-ink",
                  )}
                >
                  {r.players?.text}
                </span>
              ) : null}
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                className={cn("size-4 justify-self-end text-ink-2 transition-transform", shown && "rotate-90")}
              >
                <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            {shown ? (
              openTeamId === r.teamId ? (
                breakdown
              ) : (
                <div id={panelId} className="flex flex-col gap-3 bg-mist px-3 py-4 sm:px-5">
                  <output className="sr-only">Loading how {r.name} scored</output>
                  <Bone className="h-5 w-40 bg-mist-2" />
                  <Bone className="h-9 w-full bg-mist-2" />
                  <Bone className="h-9 w-full bg-mist-2" />
                </div>
              )
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
