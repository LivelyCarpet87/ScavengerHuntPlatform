import { Podium } from "@/components/scoreboard/podium";
import { Ordinal } from "@/components/ui/bib";
import { TeamAvatar } from "@/components/ui/team-badge";
import { formatPoints } from "@/lib/format";
import { describeProgress, isTied, type StandingRow } from "@/lib/live/types";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    plate: "",
    rank: "text-[8rem]",
    points: "text-[4rem]",
    name: "text-[2.2rem]",
    avatar: "size-[3.6rem] text-[2.1rem]",
  },
  {
    plate: "mt-[2.5rem]",
    rank: "text-[6.4rem]",
    points: "text-[3.3rem]",
    name: "text-[1.8rem]",
    avatar: "size-[3.1rem] text-[1.8rem]",
  },
  {
    plate: "mt-[4.75rem]",
    rank: "text-[5.1rem]",
    points: "text-[2.8rem]",
    name: "text-[1.65rem]",
    avatar: "size-[2.7rem] text-[1.55rem]",
  },
] as const;

/**
 * The finish: the top three on race bibs of descending size, then everyone
 * else through tenth place. Shown on the big screen once the hunt ends.
 */
export function FinalPodium({ rows }: { rows: StandingRow[] }) {
  const top = rows.slice(0, 3);
  const rest = rows.slice(3, 10);
  return (
    <section aria-label="Final results" className="flex min-h-0 flex-1 flex-col gap-8">
      {/* Phones get the scoreboard's podium; the projector gets the big one. */}
      <div className="lg:hidden">
        <Podium entries={top.map((row, i) => ({ row, tied: isTied(rows, i), you: false }))} />
      </div>
      <ol className="hidden grid-cols-[1.3fr_1.1fr_1fr] gap-6 lg:grid">
        {top.map((row, i) => {
          const step = STEPS[i];
          return (
            <li
              key={row.teamId}
              className={cn(
                "relative flex min-w-0 flex-col rounded-xl border-[3px] border-ink bg-paper px-6 pt-6 pb-5",
                step.plate,
              )}
            >
              {["top-3 left-3", "top-3 right-3", "bottom-3 left-3", "bottom-3 right-3"].map((pos) => (
                <span
                  key={pos}
                  aria-hidden
                  className={cn("absolute size-[0.8rem] rounded-full border-2 border-ink-3 bg-mist", pos)}
                />
              ))}
              <p className="flex items-start gap-3">
                <Ordinal n={row.rank ?? i + 1} className={cn("leading-[0.8]", step.rank)} />
                {isTied(rows, i) ? <span className="mt-2 text-[1.1rem] font-medium text-ink-3">tie</span> : null}
              </p>
              <p className="mt-4 flex min-w-0 items-center gap-3">
                <TeamAvatar team={row} className={step.avatar} />
                <span
                  className={cn(
                    "min-w-0 font-cond leading-tight font-extrabold tracking-tight [overflow-wrap:anywhere]",
                    step.name,
                  )}
                >
                  {row.name}
                </span>
              </p>
              <p className="mt-auto flex items-baseline gap-2 pt-4">
                <span className={cn("font-bib leading-none", step.points)}>{formatPoints(row.total)}</span>
                <span className="text-[1.2rem] font-medium text-ink-2">points</span>
              </p>
              <p className="mt-1 text-[1.1rem] text-ink-2">{describeProgress(row)}</p>
            </li>
          );
        })}
      </ol>
      {rest.length > 0 ? (
        <ol className="grid gap-x-10 border-t border-line pt-5 lg:grid-flow-col lg:grid-cols-2 lg:grid-rows-4">
          {rest.map((row, j) => (
            <li key={row.teamId} className="flex min-w-0 items-center gap-4 py-2">
              <span className="w-[2.5ch] text-right font-bib text-2xl leading-none lg:text-[2rem]">{row.rank}</span>
              <TeamAvatar team={row} className="lg:size-[2.4rem] lg:text-[1.35rem]" />
              <span className="min-w-0 flex-1 truncate font-cond text-xl font-extrabold lg:text-[1.6rem]">
                {row.name}
              </span>
              {isTied(rows, j + 3) ? <span className="text-[1rem] text-ink-3">tie</span> : null}
              <span className="font-bib text-2xl leading-none tabular-nums lg:text-[2rem]">
                {formatPoints(row.total)}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
