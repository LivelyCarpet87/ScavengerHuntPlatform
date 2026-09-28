"use client";

import { Ordinal } from "@/components/ui/bib";
import { TeamAvatar } from "@/components/ui/team-badge";
import { formatPoints } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ContestEntryRow = {
  teamId: string;
  /** Null when the team was deleted since. */
  team: { name: string; emoji: string; color: string } | null;
  place: number;
  /** "184 cm", or the time of the entry for "earliest" contests. */
  detail: string;
  /** Null outside the scoring places. */
  points: number | null;
};

/**
 * A contest's ranking on the staff scoreboard. Rendered from plain data, like
 * the standings above it, because the board re-sends it on every score change.
 */
export function ContestEntries({ rows }: { rows: ContestEntryRow[] }) {
  return (
    <ol className="divide-y divide-line border-y border-line">
      {rows.map((e) => (
        <li key={e.teamId} className={cn("flex items-center gap-3 py-2.5", e.points == null && "text-ink-2")}>
          <span className="w-12 shrink-0 text-2xl leading-none">
            <Ordinal n={e.place} />
          </span>
          {e.team ? <TeamAvatar team={e.team} size="sm" /> : null}
          <span className="min-w-0 flex-1 truncate font-semibold">{e.team?.name ?? "A team"}</span>
          <span className="shrink-0 text-sm">{e.detail}</span>
          <span className="w-14 shrink-0 text-right font-bib text-xl">
            {e.points != null ? formatPoints(e.points) : "–"}
          </span>
        </li>
      ))}
    </ol>
  );
}
