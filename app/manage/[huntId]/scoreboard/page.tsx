import { History, Snowflake } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdjustmentForm, RemoveAdjustment } from "@/components/judge/adjustment-form";
import { ContestEntries } from "@/components/judge/contest-entries";
import { DownloadLink } from "@/components/judge/download-link";
import { StandingsTable } from "@/components/judge/standings-table";
import { LiveRefresh } from "@/components/live/live-refresh";
import { ButtonLink } from "@/components/ui/button";
import { ControlMarker } from "@/components/ui/control";
import { LiveDot, Notice, PageHeader } from "@/components/ui/misc";
import { StatusGlyph } from "@/components/ui/status";
import { requireStaff, roleAtLeast } from "@/lib/auth/access";
import { formatBytes, formatPoints, formatSigned, formatTime, plural } from "@/lib/format";
import { huntPhase } from "@/lib/hunts";
import { MAX_ZIP_BYTES } from "@/lib/judging/constants";
import { formatMeasured } from "@/lib/judging/labels";
import { loadStaffScoreboard } from "@/lib/judging/scoreboard";
import { describeScoring, kindLabel } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Scoreboard" };

type Props = {
  params: Promise<{ huntId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StaffScoreboardPage({ params, searchParams }: Props) {
  const { huntId } = await params;
  const sp = await searchParams;
  const { hunt, role } = await requireStaff(huntId, "judge");
  const board = await loadStaffScoreboard(hunt);
  const organizer = roleAtLeast(role, "organizer");
  const phase = huntPhase(hunt);
  const now = Date.now();
  const tz = hunt.timezone;
  const { standings, frozen } = board;
  const exportBase = `/api/hunts/${hunt.id}/export`;

  const teamOptions = standings.standings
    .map((s) => ({
      id: s.teamId,
      name: standings.teams[s.teamId]?.name ?? s.name,
      hidden: s.hidden,
      total: s.total,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const adjustFor = typeof sp.adjust === "string" && teamOptions.some((t) => t.id === sp.adjust) ? sp.adjust : null;
  // One team's breakdown at a time, kept in the URL (so it survives live refreshes and can be linked to).
  const openTeam = typeof sp.team === "string" && teamOptions.some((t) => t.id === sp.team) ? sp.team : null;

  const contests = board.tasks.filter((t) => t.kind === "contest");
  const scoredAnything = standings.standings.some((s) => s.total !== 0 || s.solved > 0);

  let freeze: React.ReactNode = null;
  if (board.cutoff) {
    freeze = (
      <Notice tone="info" icon={<Snowflake className="size-4" />} title="The scoreboard is frozen for players">
        Players see standings as of {formatTime(board.cutoff, tz)}. You’re seeing live scores; the “Players see” column
        shows what they see. The freeze lifts when the hunt ends.
      </Notice>
    );
  } else if (hunt.freezeAt && (phase === "live" || phase === "upcoming") && now < hunt.freezeAt.getTime()) {
    freeze = (
      <Notice tone="info" icon={<Snowflake className="size-4" />}>
        The scoreboard freezes for players at {formatTime(hunt.freezeAt, tz)}. Staff always see live scores.
      </Notice>
    );
  } else if (phase === "ended" || phase === "archived") {
    freeze = (
      <Notice tone="success" title="Final standings">
        The hunt is over, so players see exactly these scores
        {board.pendingByTask && Object.values(board.pendingByTask).some((n) => n > 0)
          ? ". Submissions still waiting for a judge will change them."
          : "."}
      </Notice>
    );
  }

  const tooBig = board.media.bytes > MAX_ZIP_BYTES;

  return (
    <div className="flex flex-col gap-10">
      <LiveRefresh
        huntId={hunt.id}
        on={["submission.judged", "scores.changed", "teams.changed", "tasks.changed", "hunt.changed"]}
      />
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Scoreboard"
          description="Live standings for staff, updated the moment anything changes. Open a team to see how it scored."
          actions={
            <>
              {phase === "live" ? <LiveDot label="Live scores" /> : null}
              {organizer ? (
                <ButtonLink href={`/manage/${hunt.id}/activity`} variant="quiet">
                  <History aria-hidden />
                  Activity log
                </ButtonLink>
              ) : null}
            </>
          }
        />
        {freeze}
        {!scoredAnything && standings.standings.length > 0 ? (
          <Notice tone="info">No points yet. Scores appear here as soon as judges accept submissions.</Notice>
        ) : null}
      </div>

      <section aria-labelledby="standings-title" className="flex flex-col gap-3">
        <h2 id="standings-title" className="font-cond text-2xl font-bold">
          Standings
        </h2>
        {standings.standings.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg bg-mist px-5 py-5">
            <p className="text-ink-2">
              No teams yet. They appear here, ranked, as soon as they register with the hunt code{" "}
              <span className="font-bib text-lg text-ink">{hunt.joinCode}</span>.
            </p>
            <ButtonLink href={`/manage/${hunt.id}/teams`} variant="secondary" size="sm">
              Open teams
            </ButtonLink>
          </div>
        ) : (
          <StandingsTable
            huntId={hunt.id}
            standings={standings}
            frozen={frozen}
            tasks={board.tasks}
            adjustments={board.adjustments}
            hints={board.hints}
            timeZone={tz}
            canAdjust={organizer && hunt.status !== "archived"}
            serverNow={now}
            openTeamId={openTeam}
            keep={adjustFor ? { adjust: adjustFor } : {}}
          />
        )}
      </section>

      <div className={cn("grid gap-10", organizer && "lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]")}>
        {organizer ? (
          <section id="adjust" aria-labelledby="adjust-title" className="flex scroll-mt-24 flex-col gap-4">
            <div>
              <h2 id="adjust-title" className="font-cond text-2xl font-bold">
                Adjust a score
              </h2>
              <p className="mt-1 text-sm text-ink-2">
                For things tasks can’t capture: sportsmanship, rule breaks, late returns.
              </p>
            </div>
            {hunt.status === "archived" ? (
              <Notice tone="warning">This hunt is archived, so scores can’t change.</Notice>
            ) : standings.standings.length === 0 ? (
              <p className="text-ink-2">Once teams register you can give bonuses and penalties here.</p>
            ) : (
              <div className="rounded-lg border border-line p-4 sm:p-5">
                <AdjustmentForm huntId={hunt.id} teams={teamOptions} defaultTeamId={adjustFor} />
              </div>
            )}
            <div id="adjustments" className="scroll-mt-24">
              <h3 className="font-semibold">All adjustments</h3>
              {board.adjustments.length === 0 ? (
                <p className="mt-1 text-sm text-ink-2">None yet.</p>
              ) : (
                <ul className="mt-1 divide-y divide-line">
                  {board.adjustments.map((a) => {
                    const team = standings.teams[a.teamId];
                    return (
                      <li key={a.id} className="flex items-start gap-3 py-2.5 text-sm">
                        <span
                          className={cn(
                            "w-14 shrink-0 font-bib text-xl leading-6",
                            a.points < 0 ? "text-danger" : "text-forest",
                          )}
                        >
                          {formatSigned(a.points)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{team?.name ?? "A deleted team"}</span>
                          <span className="block text-ink">{a.reason}</span>
                          <span className="block text-xs text-ink-2">
                            {a.createdBy ?? "A former organizer"} at {formatTime(a.createdAt, tz)}
                          </span>
                        </span>
                        {hunt.status !== "archived" ? (
                          <RemoveAdjustment
                            huntId={hunt.id}
                            adjustmentId={a.id}
                            teamName={team?.name ?? "this team"}
                            points={a.points}
                            reason={a.reason}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="tasks-title" className="flex min-w-0 flex-col gap-3">
          <div>
            <h2 id="tasks-title" className="font-cond text-2xl font-bold">
              Tasks
            </h2>
            <p className="mt-1 text-sm text-ink-2">
              How many teams have each one, and what the next accepted submission is worth.
            </p>
          </div>
          {board.tasks.length === 0 ? (
            <p className="text-ink-2">
              No tasks yet.{" "}
              {organizer ? (
                <Link
                  href={`/manage/${hunt.id}/tasks`}
                  className="font-semibold text-ink underline decoration-2 underline-offset-2"
                >
                  Add the first one
                </Link>
              ) : (
                "An organizer adds them in Tasks."
              )}
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line align-bottom text-ink-2">
                <tr>
                  <th scope="col" className="py-2 pr-2 font-semibold">
                    Task
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold whitespace-nowrap">
                    Solves
                  </th>
                  <th scope="col" className="px-2 py-2 text-right leading-tight font-semibold sm:whitespace-nowrap">
                    Worth now
                  </th>
                  <th scope="col" className="hidden py-2 pl-2 text-right font-semibold whitespace-nowrap sm:table-cell">
                    In review
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {board.tasks.map((t) => {
                  const stat = standings.tasks[t.id];
                  const pending = board.pendingByTask[t.id] ?? 0;
                  const worth =
                    t.kind === "contest" ? t.points : t.scoring === "rarity" ? stat?.currentValue : stat?.nextValue;
                  const judgeHref = `/manage/${hunt.id}/judge?task=${t.id}`;
                  const judgeLabel = `Judge ${plural(pending, "waiting submission")} for ${t.code} ${t.title}`;
                  return (
                    <tr key={t.id}>
                      <td className="py-2 pr-2">
                        <span className="flex items-center gap-2.5">
                          <ControlMarker code={t.code} size="sm" className="size-8" label={`Control ${t.code}`} />
                          <span className="min-w-0">
                            <span className="block font-medium break-words">{t.title}</span>
                            <span className="block text-xs text-ink-2">
                              {kindLabel(t)}
                              {t.kind !== "contest" && t.scoring !== "fixed"
                                ? t.scoring === "rarity"
                                  ? ", drops as teams solve it"
                                  : ", first solvers earn more"
                                : ""}
                              {t.hidden ? ", hidden" : ""}
                            </span>
                            {/* Phones: the "In review" column folds into the task cell. */}
                            {pending > 0 ? (
                              <Link
                                href={judgeHref}
                                aria-label={judgeLabel}
                                className="mt-1 inline-flex items-center gap-1 rounded-full bg-sun-wash px-2 py-0.5 text-xs font-semibold text-sun-fg sm:hidden"
                              >
                                <StatusGlyph status="pending" className="size-3" />
                                {pending} in review
                              </Link>
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right font-bib text-lg">{stat?.solves ?? 0}</td>
                      <td className="px-2 py-2 text-right font-bib text-lg">{formatPoints(worth ?? t.points)}</td>
                      <td className="hidden py-2 pl-2 text-right sm:table-cell">
                        {pending > 0 ? (
                          <Link
                            href={judgeHref}
                            className="inline-flex items-center rounded-full bg-sun px-2 py-0.5 font-bib text-sm text-sun-ink hover:brightness-95"
                            aria-label={judgeLabel}
                          >
                            {pending}
                          </Link>
                        ) : (
                          <span className="text-ink-3">–</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {contests.length > 0 ? (
        <section aria-labelledby="contests-title" className="flex flex-col gap-6">
          <h2 id="contests-title" className="font-cond text-2xl font-bold">
            Contests
          </h2>
          <div className="flex flex-col gap-8">
            {contests.map((t) => {
              const entries = standings.tasks[t.id]?.contest ?? [];
              const pending = board.pendingByTask[t.id] ?? 0;
              return (
                <section key={t.id} aria-labelledby={`contest-${t.id}`} className="flex flex-col gap-2">
                  <div className="flex items-start gap-3">
                    <ControlMarker code={t.code} size="md" label={`Control ${t.code}`} />
                    <div className="min-w-0 flex-1">
                      <h3 id={`contest-${t.id}`} className="font-cond text-xl font-bold">
                        {t.title}
                      </h3>
                      <p className="text-sm text-ink-2">{describeScoring(t)}</p>
                    </div>
                    {pending > 0 ? (
                      <ButtonLink href={`/manage/${hunt.id}/judge?task=${t.id}`} variant="quiet" size="sm">
                        Judge {plural(pending, "entry", "entries")}
                      </ButtonLink>
                    ) : null}
                  </div>
                  {entries.length === 0 ? (
                    <p className="text-sm text-ink-2">No accepted entries yet.</p>
                  ) : (
                    <ContestEntries
                      rows={entries.map((e) => {
                        const team = standings.teams[e.teamId];
                        return {
                          teamId: e.teamId,
                          team: team ? { name: team.name, emoji: team.emoji, color: team.color } : null,
                          place: e.place,
                          detail: e.value != null ? formatMeasured(e.value, t.contestUnit) : formatTime(e.at, tz),
                          points: e.place <= t.contestPlaces ? e.points : null,
                        };
                      })}
                    />
                  )}
                </section>
              );
            })}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="export-title" className="flex flex-col gap-3 border-t border-line pt-8">
        <div>
          <h2 id="export-title" className="font-cond text-2xl font-bold">
            Export
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            Spreadsheets open in Excel, Numbers or Google Sheets. Scores are live, not frozen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DownloadLink href={`${exportBase}/standings.csv`} hint="CSV">
            Standings
          </DownloadLink>
          <DownloadLink href={`${exportBase}/submissions.csv`} hint="CSV">
            Submissions
          </DownloadLink>
          <DownloadLink href={`${exportBase}/teams.csv`} hint="CSV">
            Teams
          </DownloadLink>
          {board.media.files > 0 && !tooBig ? (
            <DownloadLink
              href={`${exportBase}/media.zip`}
              hint={`ZIP, ${plural(board.media.files, "file")}, ${formatBytes(board.media.bytes)}`}
            >
              Accepted photos and videos
            </DownloadLink>
          ) : null}
        </div>
        {board.media.files === 0 ? (
          <p className="text-sm text-ink-2">Accepted photos and videos can be downloaded here once there are some.</p>
        ) : tooBig ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-2">
              All accepted media together is {formatBytes(board.media.bytes)}, too much for one ZIP. Download it task by
              task:
            </p>
            <div className="flex flex-wrap gap-2">
              {board.tasks
                .filter((t) => board.media.byTask[t.id])
                .map((t) => (
                  <DownloadLink
                    key={t.id}
                    href={`${exportBase}/media.zip?task=${t.id}`}
                    size="sm"
                    variant="quiet"
                    hint={formatBytes(board.media.byTask[t.id].bytes)}
                  >
                    {t.code} {t.title}
                  </DownloadLink>
                ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
