import Link from "next/link";
import { ControlMarker } from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/countdown";
import type { Task } from "@/lib/db/schema";
import { formatPoints, formatSigned, formatTime, ordinal } from "@/lib/format";
import { formatMeasured } from "@/lib/judging/labels";
import type { AdjustmentRow, HintRow } from "@/lib/judging/scoreboard";
import type { TeamStanding } from "@/lib/scoring/engine";
import type { Standings } from "@/lib/scoring/service";
import { cn } from "@/lib/utils";
import { RemoveAdjustment } from "./adjustment-form";
import { STANDINGS_GRID, STANDINGS_GRID_FROZEN } from "./standings-grid";
import { StandingsList, type StandingsListRow } from "./standings-list";

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
  /** The team whose breakdown is open (?team=). Only that one is rendered. */
  openTeamId: string | null;
  /** Search params to keep when a row opens or closes (e.g. adjust). */
  keep: Record<string, string>;
};

/**
 * Live standings for staff: one summary row per team, sent as plain data (the
 * board re-renders on every score change), and the full breakdown for the one
 * team that's open.
 */
export function StandingsTable({
  huntId,
  standings,
  frozen,
  tasks,
  adjustments,
  hints,
  timeZone,
  canAdjust,
  serverNow,
  openTeamId,
  keep,
}: Props) {
  // Before anyone scores, everyone "shares 1st" — show no ranks instead.
  const anyScored = standings.standings.some((s) => s.lastScoredAt != null || s.total !== 0);
  const frozenById = new Map((frozen?.standings ?? []).map((f) => [f.teamId, f]));
  const grid = frozen ? STANDINGS_GRID_FROZEN : STANDINGS_GRID;

  const playersSee = (s: TeamStanding): StandingsListRow["players"] => {
    if (!frozen) return null;
    // Hidden teams never appear on the players' board, frozen or not.
    if (s.hidden) return { text: "Not shown", same: true };
    const seen = frozenById.get(s.teamId);
    if (!seen) return null;
    if (seen.rank === s.rank && seen.total === s.total) return { text: "Same", same: true };
    return {
      text: `${seen.rank != null ? ordinal(seen.rank) : "Unranked"} with ${formatPoints(seen.total)}`,
      same: false,
    };
  };

  const toRow = (s: TeamStanding): StandingsListRow | null => {
    const team = standings.teams[s.teamId];
    if (!team) return null;
    return {
      teamId: s.teamId,
      name: team.name,
      emoji: team.emoji,
      color: team.color,
      rank: !s.hidden && anyScored ? s.rank : null,
      total: s.total,
      solved: s.solved,
      taskPoints: s.taskPoints,
      contestPoints: s.contestPoints,
      hintPenalty: s.hintPenalty,
      adjustmentPoints: s.adjustmentPoints,
      players: playersSee(s),
    };
  };
  const visible = standings.standings.filter((s) => !s.hidden).flatMap((s) => toRow(s) ?? []);
  const hidden = standings.standings.filter((s) => s.hidden).flatMap((s) => toRow(s) ?? []);

  const open = openTeamId ? standings.standings.find((s) => s.teamId === openTeamId) : undefined;
  const openRow = open ? toRow(open) : null;
  const breakdown =
    open && openRow ? (
      <Breakdown
        id={`breakdown-${open.teamId}`}
        standing={open}
        huntId={huntId}
        standings={standings}
        tasks={tasks}
        adjustments={adjustments.filter((a) => a.teamId === open.teamId)}
        hints={hints.filter((h) => h.teamId === open.teamId)}
        timeZone={timeZone}
        canAdjust={canAdjust}
        serverNow={serverNow}
        players={openRow.players}
      />
    ) : null;
  const path = `/manage/${huntId}/scoreboard`;

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
          <StandingsList
            rows={visible}
            frozen={!!frozen}
            openTeamId={open && !open.hidden ? open.teamId : null}
            path={path}
            keep={keep}
            breakdown={open && !open.hidden ? breakdown : null}
            className="divide-y divide-line border-b border-line"
          />
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
          <StandingsList
            rows={hidden}
            frozen={!!frozen}
            openTeamId={open?.hidden ? open.teamId : null}
            path={path}
            keep={keep}
            breakdown={open?.hidden ? breakdown : null}
            className="divide-y divide-line border-y border-line"
          />
        </section>
      ) : null}
    </div>
  );
}

function Breakdown({
  id,
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
  id: string;
  standing: TeamStanding;
  huntId: string;
  standings: Standings;
  tasks: Task[];
  adjustments: AdjustmentRow[];
  hints: HintRow[];
  timeZone: string;
  canAdjust: boolean;
  serverNow: number;
  players: StandingsListRow["players"];
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
    <div id={id} className="flex flex-col gap-5 bg-mist px-3 py-4 sm:px-5">
      {/* The wide table shows these as columns; screen readers get them here at every width. */}
      <dl className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:sr-only">
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
            <dd className={cn("text-sm", players.same ? "text-ink-3" : "font-semibold text-ink")}>{players.text}</dd>
          </div>
        ) : null}
      </dl>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="mb-1 text-sm font-semibold">Points by task</h3>
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
            <h3 className="mb-1 text-sm font-semibold">Hints revealed</h3>
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
            <h3 className="mb-1 text-sm font-semibold">Adjustments</h3>
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
            href={`/manage/${huntId}/scoreboard?team=${s.teamId}&adjust=${s.teamId}#adjust`}
            className="font-semibold underline decoration-line-strong decoration-2 underline-offset-2 hover:decoration-ink"
          >
            Adjust their score
          </Link>
        ) : null}
      </p>
    </div>
  );
}
