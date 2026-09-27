import { CalendarClock, FilePenLine, Hourglass, Snowflake } from "lucide-react";
import { LiveRefresh } from "@/components/live/live-refresh";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { InviteCard } from "@/components/team/invite-card";
import { Roster } from "@/components/team/member-identity";
import { Ordinal } from "@/components/ui/bib";
import { ButtonLink } from "@/components/ui/button";
import { FinishMark, StartMark } from "@/components/ui/control";
import { Countdown } from "@/components/ui/countdown";
import { EmptyState } from "@/components/ui/empty-state";
import { LiveDot, Notice } from "@/components/ui/misc";
import { ControlCard } from "@/components/ui/punch";
import type { PlayerContext } from "@/lib/auth/access";
import type { Hunt, StaffRole } from "@/lib/db/schema";
import { formatDate, formatDateTime, formatPoints, formatTime, plural } from "@/lib/format";
import { canViewGallery, canViewScoreboard, huntPhase, scoreboardCutoff } from "@/lib/hunts";
import { daysUntil } from "@/lib/player/join";
import { getTeamProgress } from "@/lib/player/progress";
import { getHuntTasks, getPinnedAnnouncements, getTeamMembers } from "@/lib/player/queries";
import { getStandings, rankedCount, standingFor } from "@/lib/scoring/service";
import { links } from "@/lib/url";
import { endText } from "../join/schedule";
import { PinnedAnnouncements } from "./pinned-announcements";
import { RefreshAt } from "./refresh-at";
import { TaskList } from "./task-list";
import { buildTaskBoard } from "./task-rows";
import { type BibFigureData, TeamBib } from "./team-bib";
import { WelcomeBlock } from "./welcome";

const DAY = 86_400_000;

/**
 * /h/[slug] for a team member: the team's bib, where the hunt stands, the
 * control card and every task, kept live as judges decide and tasks unlock.
 */
export async function HuntHome({
  hunt,
  me,
  staffRole,
  welcome,
}: {
  hunt: Hunt;
  me: PlayerContext;
  staffRole: StaffRole | null;
  welcome: boolean;
}) {
  const nowDate = new Date();
  const now = nowDate.getTime();
  const phase = huntPhase(hunt, nowDate);
  const started = phase === "live" || phase === "ended" || phase === "archived";
  const over = phase === "ended" || phase === "archived";
  const viewer = { isStaff: !!staffRole, isPlayer: true };
  const cutoff = scoreboardCutoff(hunt, viewer, nowDate);
  const tz = hunt.timezone;

  const [standings, progress, huntTasks, pinned, members] = await Promise.all([
    getStandings(hunt.id, { cutoff }),
    getTeamProgress(me.team.id),
    getHuntTasks(hunt.id, nowDate),
    getPinnedAnnouncements(hunt.id, 2),
    getTeamMembers(me.team.id),
  ]);

  const board = started
    ? buildTaskBoard({
        tasks: huntTasks.visible,
        progress,
        standings,
        teamId: me.team.id,
        slug: hunt.slug,
        phase,
        timezone: tz,
        now,
      })
    : null;

  const mine = standingFor(standings, me.team.id);
  const showRank = canViewScoreboard(hunt, viewer) && mine?.rank != null;
  const teamCount = rankedCount(standings);
  const tied = showRank && standings.standings.some((s) => s.teamId !== me.team.id && s.rank === mine?.rank);

  let figures: BibFigureData[];
  if (started && mine && showRank && mine.rank != null) {
    figures = [
      {
        key: "rank",
        value: <Ordinal n={mine.rank} />,
        caption: `${over ? "final, " : ""}${tied ? "tied, " : ""}of ${plural(teamCount, "team")}`,
      },
      { key: "points", value: formatPoints(mine.total), caption: "points" },
    ];
  } else if (started) {
    figures = [
      { key: "points", value: formatPoints(mine?.total ?? 0), caption: over ? "final points" : "points" },
      { key: "done", value: board?.done ?? 0, caption: `of ${plural(board?.rows.length ?? 0, "task")} done` },
    ];
  } else {
    // Before the start: who's on the team, and what's out there to find.
    figures = [
      {
        key: "players",
        value: members.length,
        caption: hunt.maxTeamSize ? `of ${hunt.maxTeamSize} players` : members.length === 1 ? "player" : "players",
      },
    ];
    if (huntTasks.listed > 0) {
      figures.push({
        key: "controls",
        value: huntTasks.listed,
        caption: huntTasks.listed === 1 ? "control to find" : "controls to find",
      });
    }
  }

  const createdTeam =
    me.player.isCaptain && Math.abs(me.team.createdAt.getTime() - me.player.createdAt.getTime()) < 60_000;
  const updatesHref = `/h/${hunt.slug}/updates`;

  return (
    <div className="flex flex-col gap-8">
      {/* submission.created only reaches this team: a teammate's proof shows up as "In review" right away. */}
      <LiveRefresh
        huntId={hunt.id}
        on={["tasks.changed", "hunt.changed", "scores.changed", "teams.changed", "submission.created"]}
      />
      <RefreshAt
        at={[
          hunt.startsAt?.getTime(),
          hunt.endsAt?.getTime(),
          hunt.freezeAt?.getTime(),
          hunt.startsAt && hunt.startsAt.getTime() - DAY,
          huntTasks.later.nextAt?.getTime(),
        ]}
      />

      {welcome ? (
        <WelcomeBlock teamName={me.team.name} created={createdTeam}>
          <InviteCard hunt={hunt} team={me.team} />
          <InstallPrompt />
        </WelcomeBlock>
      ) : null}

      {/* grid-cols-1 keeps the track from growing to a long team name's width on phones. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
        <TeamBib team={me.team} player={me.player} figures={figures} />
        {phase === "live" ? <FinishPanel hunt={hunt} now={now} /> : null}
        {phase === "upcoming" || phase === "draft" ? <StartPanel hunt={hunt} now={now} /> : null}
        {over ? (
          <FinalPanel
            hunt={hunt}
            phase={phase}
            scoreboard={canViewScoreboard(hunt, viewer)}
            gallery={canViewGallery(hunt, viewer, nowDate)}
          />
        ) : null}
      </div>

      {phase === "draft" ? (
        <Notice tone="warning" icon={<FilePenLine className="size-4" />} title="This hunt is still a draft">
          Only staff can open it. Tasks appear once it’s published and the start time arrives.
        </Notice>
      ) : null}
      {phase === "upcoming" || phase === "draft" ? (
        <p className="-mt-2 max-w-prose text-lg">
          Tasks appear when the hunt starts. Until then, get your team together.
        </p>
      ) : null}

      {cutoff ? (
        <Notice
          tone="warning"
          icon={<Snowflake className="size-4" />}
          title={`Scoreboard frozen at ${formatTime(cutoff, tz)}`}
        >
          Rank and points stay as they were then, so the finish is a surprise. Everything still counts, and newer points
          show when the hunt ends.
        </Notice>
      ) : null}

      <PinnedAnnouncements items={pinned} updatesHref={updatesHref} now={now} />

      {board ? (
        board.rows.length > 0 ? (
          <>
            <section aria-labelledby="card-heading">
              <div className="flex items-baseline justify-between gap-4">
                <h2 id="card-heading" className="font-cond text-2xl font-bold tracking-tight">
                  Control card
                </h2>
                <p className="text-sm text-ink-2">
                  <span className="font-bib text-lg text-ink">{board.done}</span> of {board.rows.length} punched
                </p>
              </div>
              <ControlCard cells={board.cells} className="mt-3" />
            </section>

            <section aria-labelledby="tasks-heading" className="flex flex-col gap-3">
              <h2 id="tasks-heading" className="font-cond text-2xl font-bold tracking-tight">
                Tasks
              </h2>
              <TaskList rows={board.rows} over={over} />
              {!over && huntTasks.later.count > 0 ? (
                <p className="flex items-center gap-2.5 pt-1 text-sm text-ink-2">
                  <Hourglass aria-hidden className="size-4 shrink-0" />
                  <span>
                    {huntTasks.later.count === 1
                      ? "1 more task unlocks later"
                      : `${huntTasks.later.count} more tasks unlock later`}
                    {huntTasks.later.nextAt ? ` — next at ${unlockTime(huntTasks.later.nextAt, nowDate, tz)}` : ""}
                  </span>
                </p>
              ) : null}
            </section>
          </>
        ) : (
          <EmptyState title={over ? "No tasks in this hunt" : "No tasks out yet"}>
            {over
              ? "This hunt finished without any tasks."
              : huntTasks.later.nextAt
                ? `The first tasks unlock at ${unlockTime(huntTasks.later.nextAt, nowDate, tz)}. They’ll appear here on their own.`
                : "They’ll appear here on their own as soon as the organizers release them."}
          </EmptyState>
        )
      ) : (
        <>
          <section aria-labelledby="roster-heading">
            <h2 id="roster-heading" className="font-cond text-2xl font-bold tracking-tight">
              Your team
            </h2>
            <Roster members={members} meId={me.player.id} className="mt-2" />
          </section>
          {welcome ? null : (
            <section aria-labelledby="invite-heading" className="flex flex-col gap-3">
              <h2 id="invite-heading" className="font-cond text-2xl font-bold tracking-tight">
                Invite teammates
              </h2>
              <InviteCard hunt={hunt} team={me.team} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function unlockTime(at: Date, now: Date, timeZone: string): string {
  return formatDate(at, timeZone) === formatDate(now, timeZone)
    ? formatTime(at, timeZone)
    : formatDateTime(at, timeZone);
}

const panel = "flex flex-col rounded-lg bg-mist p-4 md:justify-center md:p-5";

/** Before the start: how long to go, and when exactly. */
function StartPanel({ hunt, now }: { hunt: Pick<Hunt, "startsAt" | "timezone">; now: number }) {
  if (!hunt.startsAt) {
    return (
      <section aria-labelledby="start-heading" className={panel}>
        <CalendarClock aria-hidden className="size-6 text-ink-2" />
        <h2 id="start-heading" className="mt-2 font-cond text-2xl leading-tight font-extrabold tracking-tight">
          Start time to come
        </h2>
        <p className="mt-1 text-sm text-ink-2">The organizers will announce it.</p>
      </section>
    );
  }
  const left = hunt.startsAt.getTime() - now;
  const days = Math.max(1, daysUntil(hunt.startsAt, new Date(now), hunt.timezone));
  return (
    <section aria-labelledby="start-heading" className={panel}>
      <h2 id="start-heading" className="text-sm font-semibold text-ink-2">
        Starts in
      </h2>
      {left > DAY ? (
        <p className="mt-1.5 flex items-baseline gap-2.5">
          <span className="font-bib text-7xl leading-[0.8]">{days}</span>
          <span className="font-cond text-2xl font-bold">{days === 1 ? "day" : "days"}</span>
        </p>
      ) : (
        <Countdown to={hunt.startsAt.getTime()} serverNow={now} className="mt-1.5 text-7xl leading-[0.8] md:text-6xl" />
      )}
      <p className="mt-3 flex items-center gap-2 text-sm text-ink-2">
        <StartMark size={16} />
        {formatDateTime(hunt.startsAt, hunt.timezone)}
      </p>
    </section>
  );
}

/** During the hunt: the finish time and the time left (a slim bar on phones). */
function FinishPanel({ hunt, now }: { hunt: Pick<Hunt, "startsAt" | "endsAt" | "timezone">; now: number }) {
  if (!hunt.endsAt) {
    return (
      <section aria-label="Hunt status" className={panel}>
        <LiveDot label="Live now" className="text-sm" />
        <p className="mt-1 text-sm text-ink-2">No set finish time. The organizers will call it.</p>
      </section>
    );
  }
  return (
    <section
      aria-label="Time left"
      className="flex items-center justify-between gap-4 rounded-lg bg-mist px-4 py-3 md:flex-col md:items-start md:justify-center md:gap-3 md:p-5"
    >
      <span className="flex items-center gap-2.5 font-medium">
        <FinishMark size={22} />
        {endText(hunt, "live")}
      </span>
      <span className="flex items-baseline gap-1.5">
        <Countdown to={hunt.endsAt.getTime()} serverNow={now} className="text-3xl leading-none md:text-6xl" />
        <span className="text-sm text-ink-2">left</span>
      </span>
    </section>
  );
}

/** After the finish (the bib shows the final result): where to see how everyone did. */
function FinalPanel({
  hunt,
  phase,
  scoreboard,
  gallery,
}: {
  hunt: Pick<Hunt, "slug" | "startsAt" | "endsAt" | "timezone">;
  phase: "ended" | "archived";
  scoreboard: boolean;
  gallery: boolean;
}) {
  return (
    <section aria-labelledby="final-heading" className={`${panel} gap-4`}>
      <div className="flex items-center gap-3">
        <FinishMark size={28} />
        <div className="min-w-0">
          <h2 id="final-heading" className="font-cond text-2xl leading-tight font-extrabold tracking-tight">
            This hunt has finished
          </h2>
          {hunt.endsAt ? <p className="text-sm text-ink-2">{endText(hunt, phase)}</p> : null}
        </div>
      </div>
      {scoreboard || gallery ? (
        <div className="flex flex-col gap-2">
          {scoreboard ? (
            <ButtonLink href={links.scoreboard(hunt.slug)} className="w-full">
              See the scoreboard
            </ButtonLink>
          ) : null}
          {gallery ? (
            <ButtonLink href={`/h/${hunt.slug}/gallery`} variant="secondary" className="w-full">
              Browse the gallery
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
