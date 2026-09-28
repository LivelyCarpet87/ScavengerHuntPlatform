import type { ReactNode } from "react";
import { Bib, BibFigure } from "@/components/ui/bib";
import { TeamAvatar } from "@/components/ui/team-badge";
import type { Player, Team } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export type BibFigureData = { key: string; value: ReactNode; caption: ReactNode };

/**
 * The team's race bib: printed with the team's emblem and name across the
 * top, and the figures that matter right now in big numerals (rank and
 * points during the hunt, team size and start time before it).
 */
export function TeamBib({
  team,
  player,
  figures,
  className,
}: {
  team: Pick<Team, "name" | "emoji" | "color">;
  player: Pick<Player, "name" | "isCaptain">;
  figures: BibFigureData[];
  className?: string;
}) {
  return (
    <Bib className={cn("min-w-0 flex-col gap-5 px-5 pt-5 pb-4 sm:px-7 sm:pt-6", className)}>
      <div className="flex min-w-0 items-center gap-3.5">
        <TeamAvatar team={team} size="lg" />
        <div className="min-w-0">
          <h1 className="line-clamp-2 font-cond text-3xl leading-[1.05] font-extrabold tracking-tight break-words">
            {team.name}
          </h1>
          <p className="truncate text-sm text-ink-2">
            Playing as {player.name}
            {player.isCaptain ? ", captain" : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-x-9 gap-y-4 border-t-2 border-dashed border-line-strong pt-4 sm:gap-x-12">
        {figures.map((f) => (
          <BibFigure key={f.key} value={f.value} caption={f.caption} />
        ))}
      </div>
    </Bib>
  );
}
