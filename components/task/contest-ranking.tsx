import { Snowflake } from "lucide-react";
import { Numeral, Ordinal } from "@/components/ui/bib";
import { Notice } from "@/components/ui/misc";
import { TeamBadge } from "@/components/ui/team-badge";
import type { Task } from "@/lib/db/schema";
import { formatPoints, formatSigned, formatTime } from "@/lib/format";
import { placementLadder } from "@/lib/scoring/engine";
import type { Standings } from "@/lib/scoring/service";
import { cn } from "@/lib/utils";

/**
 * A contest's current places: every ranked team with its value and the
 * points the place is worth, scoring places still up for grabs, and the
 * viewer's team highlighted. Players see it as of the scoreboard freeze.
 */
export function ContestRanking({
  task,
  standings,
  myTeamId,
  timeZone,
}: {
  task: Pick<Task, "id" | "contestPlaces" | "points" | "minPoints" | "contestRank" | "contestUnit">;
  standings: Standings;
  myTeamId: string | null;
  timeZone: string;
}) {
  const entries = standings.tasks[task.id]?.contest ?? [];
  const ladder = placementLadder(task.contestPlaces, task.points, task.minPoints);
  const open = ladder.slice(entries.length).map((points, i) => ({ place: entries.length + i + 1, points }));
  const unit = task.contestUnit ? ` ${task.contestUnit}` : "";

  return (
    <div className="flex flex-col gap-3">
      {standings.cutoff != null ? (
        <Notice
          tone="warning"
          icon={<Snowflake className="size-4" />}
          title={`Scoreboard frozen at ${formatTime(standings.cutoff, timeZone)}`}
        >
          These are the places as they stood then. Entries judged since still count, and the final places show when the
          hunt ends.
        </Notice>
      ) : null}
      <ol className="flex flex-col divide-y divide-line">
        {entries.map((entry) => {
          const team = standings.teams[entry.teamId];
          if (!team) return null;
          const mine = entry.teamId === myTeamId;
          return (
            <li
              key={entry.teamId}
              className={cn(
                "grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 py-3",
                mine && "-mx-3 rounded-md border-transparent bg-sun-wash px-3",
              )}
            >
              <Ordinal n={entry.place} className="text-3xl leading-none" />
              <div className="min-w-0">
                {/* max-w-full lets a long team name truncate instead of running under the value. */}
                <TeamBadge team={team} size="sm" className="max-w-full" />
                {mine ? <p className="mt-0.5 pl-9.5 text-xs font-semibold text-sun-fg">Your team</p> : null}
              </div>
              <div className="text-right">
                <p className="whitespace-nowrap">
                  {entry.value != null ? (
                    <>
                      <Numeral className="text-2xl">{formatPoints(entry.value)}</Numeral>
                      <span className="text-sm text-ink-2">{unit}</span>
                    </>
                  ) : (
                    <span className="text-sm text-ink-2">
                      Sent <Numeral className="text-lg text-ink">{formatTime(entry.at, timeZone)}</Numeral>
                    </span>
                  )}
                </p>
                <p className="text-sm whitespace-nowrap text-ink-2">
                  {entry.points > 0
                    ? `${formatSigned(entry.points)} points`
                    : entry.place > task.contestPlaces
                      ? `Outside the top ${task.contestPlaces}`
                      : "No points"}
                </p>
              </div>
            </li>
          );
        })}
        {open.map((slot) => (
          <li
            key={`open-${slot.place}`}
            className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 py-3"
          >
            <Ordinal n={slot.place} className="text-3xl leading-none text-ink-3" />
            <p className="text-ink-2">Still open</p>
            <p className="text-right text-sm text-ink-2">
              <Numeral className="text-lg text-ink">{formatSigned(slot.points)}</Numeral> points
            </p>
          </li>
        ))}
      </ol>
      {entries.length === 0 ? (
        <p className="text-sm text-ink-2">No accepted entries yet. Places appear here as the judges review entries.</p>
      ) : null}
    </div>
  );
}
