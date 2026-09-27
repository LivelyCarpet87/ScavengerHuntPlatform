import Link from "next/link";
import type { ReactNode } from "react";
import { Ordinal } from "@/components/ui/bib";
import { ControlMarker } from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/countdown";
import { TeamAvatar } from "@/components/ui/team-badge";
import type { Task } from "@/lib/db/schema";
import { formatPoints, formatSigned, formatTime, ordinal } from "@/lib/format";
import { formatMeasured } from "@/lib/judging/labels";
import type { AdjustmentRow, HintRow } from "@/lib/judging/scoreboard";
import type { TeamStanding } from "@/lib/scoring/engine";
import type { Standings } from "@/lib/scoring/service";
import { cn } from "@/lib/utils";
import { RemoveAdjustment } from "./adjustment-form";

const WIDE = "lg:grid-cols-[3.25rem_minmax(0,1fr)_3.75rem_4.5rem_4.75rem_4rem_6.5rem_5.5rem_1.25rem] lg:gap-x-3";
const WIDE_FROZEN =
  "lg:grid-cols-[3.25rem_minmax(0,1fr)_3.75rem_4.5rem_4.75rem_4rem_6.5rem_5.5rem_6.5rem_1.25rem] lg:gap-x-3";

function Signed({ value, zero = "–" }: { value: number; zero?: string }) {
  return <span className={cn(value === 0 && "text-ink-3")}>{value === 0 ? zero : formatSigned(value)}</span>;
}

type Props = {
  huntId: string;
  standings: Standings;
  frozen: Standings | null;
  tasks: Task[];
  adjustments: AdjustmentRow[];
  hints: HintRow[];
  timeZone: string;
  canAdjust: boolean;
  serverNow: number;
};

export function StandingsTable(props: Props) {
  const { standings, frozen } = props;
  const visible = standings.standings.filter((s) => !s.hidden);
  const hidden = standings.standings.filter((s) => s.hidden);
  const grid = frozen ? WIDE_FROZEN : WIDE;
  // Before anyone scores, everyone "shares 1st" — show no ranks instead.
  const anyScored = standings.standings.some((s) => s.lastScoredAt != null || s.total !== 0);

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Ranked teams">
        <div
          aria-hidden
          className={cn("hidden border-b border-line px-3 pb-2 text-sm font-semibold text-ink-2 lg:grid", grid)}
        >
          <span>Rank</span>
          <span>Team</span>
          <span className="text-right">Solved</span>
          <span className="text-right">Tasks</span>
          <span className="text-right">Contests</span>
          <span className="text-right">Hints</span>
          <span className="text-right">Adjustments</span>
          <span className="text-right">Total</span>
          {frozen ? <span className="text-right">Players see</span> : null}
          <span />
        </div>
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-ink-2">Only hidden teams so far. Teams that register appear here, ranked.</p>
        ) : (
          <ol className="divide-y divide-line border-b border-line">
            {visible.map((s) => (
              <StandingRow key={s.teamId} standing={s} grid={grid} showRank={anyScored} {...props} />
            ))}
          </ol>
        )}
      </section>

      {hidden.length > 0 ? (
        <section aria-labelledby="hidden-teams">
          <h3 id="hidden-teams" className="font-semibold">
            Hidden teams
          </h3>
          <p className="mb-2 text-sm text-ink-2">
            Test runs score like everyone else, but players never see them and they don’t change anyone’s points.
          </p>
          <ol className="divide-y divide-line border-y border-line">
            {hidden.map((s) => (
              <StandingRow key={s.teamId} standing={s} grid={grid} showRank={false} {...props} />
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function StandingRow({
  standing: s,
  grid,
  showRank,
  huntId,
  standings,
  frozen,
  tasks,
  adjustments,
  hints,
  timeZone,
  canAdjust,
  serverNow,
}: Props & { standing: TeamStanding; grid: string; showRank: boolean }) {
  const team = standings.teams[s.teamId];
  if (!team) return null;
  const seen = frozen?.standings.find((f) => f.teamId === s.teamId);
  const sameAsLive = seen && seen.rank === s.rank && seen.total === s.total;
  let players: ReactNode = null;
  if (frozen && s.hidden) {
    // Hidden teams never appear on the players' board, frozen or not.
    players = <span className="text-sm text-ink-3">Not shown</span>;
  } else if (seen) {
    players = (
      <span className={cn("text-sm", sameAsLive ? "text-ink-3" : "font-semibold text-ink")}>
        {sameAsLive
          ? "Same"
          : `${seen.rank != null ? ordinal(seen.rank) : "Unranked"} with ${formatPoints(seen.total)}`}
      </span>
    );
  }

  return (
    <li id={`team-${s.teamId}`}>
      <details className="group">
        <summary
          className={cn(
            "grid cursor-pointer list-none grid-cols-[2.75rem_minmax(0,1fr)_auto_1.25rem] items-center gap-x-3 px-3 py-3 transition-colors hover:bg-mist [&::-webkit-details-marker]:hidden",
            grid,
          )}
        >
          <span className="text-2xl leading-none">
            {s.rank != null && showRank ? <Ordinal n={s.rank} /> : <span className="font-bib text-ink-3">–</span>}
          </span>
          <span className="flex min-w-0 items-center gap-2.5">
            <TeamAvatar team={team} size="sm" />
            <span className="truncate font-semibold">{team.name}</span>
          </span>
          <span className="hidden text-right font-bib text-lg lg:block">{s.solved}</span>
          <span className="hidden text-right font-bib text-lg lg:block">{formatPoints(s.taskPoints)}</span>
          <span className="hidden text-right font-bib text-lg lg:block">
            {s.contestPoints ? formatPoints(s.contestPoints) : <span className="text-ink-3">–</span>}
          </span>
          <span className="hidden text-right font-bib text-lg lg:block">
            <Signed value={-s.hintPenalty} />
          </span>
          <span className="hidden text-right font-bib text-lg lg:block">
            <Signed value={s.adjustmentPoints} />
          </span>
          <span className="text-right font-bib text-3xl leading-none">{formatPoints(s.total)}</span>
          {frozen ? <span className="hidden text-right lg:block">{players}</span> : null}
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="size-4 justify-self-end text-ink-2 transition-transform group-open:rotate-90"
          >
            <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="sr-only">Show how {team.name} scored</span>
        </summary>
        <Breakdown
          standing={s}
          huntId={huntId}
          standings={standings}
          tasks={tasks}
          adjustments={adjustments.filter((a) => a.teamId === s.teamId)}
          hints={hints.filter((h) => h.teamId === s.teamId)}
          timeZone={timeZone}
          canAdjust={canAdjust}
          serverNow={serverNow}
          players={frozen ? players : null}
        />
      </details>
    </li>
  );
}

function Breakdown({
  standing: s,
  huntId,
  standings,
  tasks,
  adjustments,
  hints,
  timeZone,
  canAdjust,
  serverNow,
  players,
}: {
  standing: TeamStanding;
  huntId: string;
  standings: Standings;
  tasks: Task[];
  adjustments: AdjustmentRow[];
  hints: HintRow[];
  timeZone: string;
  canAdjust: boolean;
  serverNow: number;
  players: ReactNode;
}) {
  const team = standings.teams[s.teamId];
  const awards = standings.awards[s.teamId] ?? {};
  const solvedAt = standings.solvedAt[s.teamId] ?? {};
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const scored = tasks.filter((t) => {
    if (t.kind === "contest") return (standings.tasks[t.id]?.contest ?? []).some((e) => e.teamId === s.teamId);
    return solvedAt[t.id] != null;
  });

  return (
    <div className="flex flex-col gap-5 bg-mist px-3 py-4 sm:px-5">
      <dl className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:hidden">
        {[
          ["Solved", String(s.solved)],
          ["Tasks", formatPoints(s.taskPoints)],
          ["Contests", formatPoints(s.contestPoints)],
          ["Hints", s.hintPenalty ? formatSigned(-s.hintPenalty) : "–"],
          ["Adjustments", s.adjustmentPoints ? formatSigned(s.adjustmentPoints) : "–"],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-xs font-semibold text-ink-2">{label}</dt>
            <dd className="font-bib text-xl">{value}</dd>
          </div>
        ))}
        {players ? (
          <div className="col-span-3 flex flex-col sm:col-span-5">
            <dt className="text-xs font-semibold text-ink-2">Players see</dt>
            <dd>{players}</dd>
          </div>
        ) : null}
      </dl>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h4 className="mb-1 text-sm font-semibold">Points by task</h4>
          {scored.length === 0 ? (
            <p className="text-sm text-ink-2">Nothing accepted yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {scored.map((t) => {
                const entry = standings.tasks[t.id]?.contest?.find((e) => e.teamId === s.teamId);
                const when = t.kind === "contest" ? entry?.at : solvedAt[t.id];
                return (
                  <li key={t.id} className="flex items-center gap-2.5 py-2">
                    <ControlMarker
                      code={t.code}
                      state="approved"
                      size="sm"
                      className="size-7"
                      label={`Control ${t.code}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.title}</span>
                      <span className="block text-xs text-ink-2">
                        {t.kind === "contest" && entry
                          ? `${entry.place <= t.contestPlaces ? `${ordinal(entry.place)} place` : `${ordinal(entry.place)}, no points`}${entry.value != null ? `, ${formatMeasured(entry.value, t.contestUnit)}` : ""}`
                          : `Solved ${when ? formatTime(when, timeZone) : ""}`}
                      </span>
                    </span>
                    <span className="font-bib text-lg">{formatPoints(awards[t.id] ?? 0)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-5">
          <section>
            <h4 className="mb-1 text-sm font-semibold">Hints revealed</h4>
            {hints.length === 0 ? (
              <p className="text-sm text-ink-2">None.</p>
            ) : (
              <ul className="divide-y divide-line">
                {hints.map((h, i) => {
                  const t = taskById.get(h.taskId);
                  return (
                    <li key={`${h.taskId}-${i}`} className="flex items-center gap-2.5 py-2 text-sm">
                      {t ? (
                        <ControlMarker code={t.code} size="sm" className="size-7" label={`Control ${t.code}`} />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate">
                        {t?.title ?? "A deleted task"}{" "}
                        <span className="text-ink-2">at {formatTime(h.createdAt, timeZone)}</span>
                      </span>
                      <span className="font-bib text-lg">{formatSigned(-h.cost)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h4 className="mb-1 text-sm font-semibold">Adjustments</h4>
            {adjustments.length === 0 ? (
              <p className="text-sm text-ink-2">None.</p>
            ) : (
              <ul className="divide-y divide-line">
                {adjustments.map((a) => (
                  <li key={a.id} className="flex items-start gap-2.5 py-2 text-sm">
                    <span className="w-14 shrink-0 font-bib text-lg leading-6">{formatSigned(a.points)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block">{a.reason}</span>
                      <span className="block text-xs text-ink-2">
                        {a.createdBy ?? "A former organizer"}, <RelativeTime at={a.createdAt} serverNow={serverNow} />
                      </span>
                    </span>
                    {canAdjust && team ? (
                      <RemoveAdjustment
                        huntId={huntId}
                        adjustmentId={a.id}
                        teamName={team.name}
                        points={a.points}
                        reason={a.reason}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <p className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <Link
          href={`/manage/${huntId}/submissions?team=${s.teamId}`}
          className="font-semibold underline decoration-line-strong decoration-2 underline-offset-2 hover:decoration-ink"
        >
          Submissions from {team?.name ?? "this team"}
        </Link>
        {canAdjust ? (
          <Link
            href={`/manage/${huntId}/scoreboard?adjust=${s.teamId}#adjust`}
            className="font-semibold underline decoration-line-strong decoration-2 underline-offset-2 hover:decoration-ink"
          >
            Adjust their score
          </Link>
        ) : null}
      </p>
    </div>
  );
}
