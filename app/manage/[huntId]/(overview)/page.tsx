import { asc, eq } from "drizzle-orm";
import { Archive, CircleCheck, Gavel, ListPlus, Printer, Snowflake, Trophy } from "lucide-react";
import type { Metadata } from "next";
import { LiveRefresh } from "@/components/live/live-refresh";
import { HuntPhaseChip } from "@/components/shells/staff-shell";
import { HuntMap } from "@/components/staff/hunt-map";
import { ActivityFeed, LeaderboardMini } from "@/components/staff/overview-lists";
import { PhaseClock } from "@/components/staff/phase-clock";
import { PublishButton } from "@/components/staff/publish-button";
import { SetupChecklist } from "@/components/staff/setup-checklist";
import { SharePanel } from "@/components/staff/share-panel";
import { StatCell, StatStrip } from "@/components/staff/stat-strip";
import { WrapUpPanel } from "@/components/staff/wrap-up-panel";
import { ButtonLink } from "@/components/ui/button";
import { FinishMark, StartMark } from "@/components/ui/control";
import { Notice } from "@/components/ui/misc";
import { StatusGlyph } from "@/components/ui/status";
import { requireStaff, roleAtLeast } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { type Hunt, tasks } from "@/lib/db/schema";
import { formatDateTime, formatTime } from "@/lib/format";
import { type HuntPhase, huntPhase } from "@/lib/hunts";
import { getStandings } from "@/lib/scoring/service";
import { setupSteps } from "@/lib/staff/checklist";
import { formatSchedule, publishConsequence } from "@/lib/staff/format";
import { staffTitle } from "@/lib/staff/metadata";
import {
  activeInviteCount,
  archivedAt,
  checkpointKey,
  getHuntStats,
  type HuntStats,
  printedCheckpointKeys,
  recentActivity,
  staffCount,
} from "@/lib/staff/queries";
import { absoluteUrl, baseUrl, links } from "@/lib/url";

export async function generateMetadata({ params }: { params: Promise<{ huntId: string }> }): Promise<Metadata> {
  return staffTitle((await params).huntId, "Overview");
}

export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ huntId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { huntId } = await params;
  const sp = await searchParams;
  const { hunt, role } = await requireStaff(huntId, "judge");
  const organizer = roleAtLeast(role, "organizer");
  const now = new Date();
  const phase = huntPhase(hunt, now);

  const [stats, activity, standings, staffN, inviteN, printedKeys, codeRows, joinUrl, base, archivedOn] =
    await Promise.all([
      getHuntStats(hunt.id),
      recentActivity(hunt.id, 10),
      getStandings(hunt.id),
      staffCount(hunt.id),
      activeInviteCount(hunt.id, now),
      printedCheckpointKeys(hunt.id),
      db
        .select({ id: tasks.id, code: tasks.code, checkpointCode: tasks.checkpointCode })
        .from(tasks)
        .where(eq(tasks.huntId, hunt.id))
        .orderBy(asc(tasks.sortOrder)),
      absoluteUrl(links.join(hunt.joinCode)),
      baseUrl(),
      phase === "archived" ? archivedAt(hunt.id) : null,
    ]);
  // Checkpoints whose poster has been printed with the code they have now.
  const printed = codeRows.filter(
    (t) => t.checkpointCode && printedKeys.has(checkpointKey(t.id, t.checkpointCode)),
  ).length;

  const schedule = formatSchedule(hunt.startsAt, hunt.endsAt, hunt.timezone);
  const settingUp = phase === "draft" || phase === "upcoming";
  const steps = setupSteps({
    huntId: hunt.id,
    status: hunt.status,
    hasStart: !!hunt.startsAt,
    hasEnd: !!hunt.endsAt,
    scheduleText: schedule,
    taskCount: stats.tasks,
    checkpointCount: stats.checkpoints,
    helperCount: Math.max(0, staffN - 1) + inviteN,
    inviteCount: inviteN,
    playerCount: stats.players,
    printedCheckpoints: printed,
  });
  const publish =
    organizer && hunt.status === "draft" && stats.tasks > 0 ? (
      <PublishButton
        huntId={hunt.id}
        huntName={hunt.name}
        consequence={publishConsequence(hunt, now)}
        variant="secondary"
        size="sm"
      />
    ) : null;

  return (
    <div className="flex flex-col gap-8">
      <LiveRefresh huntId={hunt.id} on={["scores.changed", "teams.changed", "tasks.changed", "hunt.changed"]} />

      {sp.created ? (
        <Notice
          tone="success"
          icon={<CircleCheck className="size-4" />}
          title={sp.created === "copy" ? "Copy created as a draft" : "Hunt created as a draft"}
        >
          {sp.created === "copy"
            ? "Players can’t see it until you publish. The schedule and task unlock times were cleared: set new ones first."
            : "Players can’t see it until you publish. Work through the checklist below, then publish."}
        </Notice>
      ) : null}

      <header className="overflow-hidden rounded-xl border border-line">
        <HuntMap
          seed={hunt.id}
          controls={codeRows.length}
          codes={codeRows.map((r) => r.code)}
          aspect={4.5}
          className="h-28 border-b border-line sm:h-36"
        />
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 p-5 sm:p-6">
          <div className="min-w-0 max-w-2xl">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <HuntPhaseChip hunt={hunt} />
              <span className="text-sm text-ink-2">{schedule}</span>
            </div>
            <h1 className="mt-2 font-cond text-4xl font-extrabold tracking-tight text-balance wrap-anywhere sm:text-5xl">
              {hunt.name}
            </h1>
            {hunt.tagline ? <p className="mt-1.5 text-ink-2">{hunt.tagline}</p> : null}
            <p className="mt-1 text-xs text-ink-3">Times shown in {hunt.timezone.replace(/_/g, " ")}.</p>
          </div>
          <div className="flex flex-col items-start gap-4 sm:items-end">
            <Clock hunt={hunt} phase={phase} now={now.getTime()} archivedOn={archivedOn} />
            <PrimaryAction hunt={hunt} phase={phase} organizer={organizer} stats={stats} now={now} />
          </div>
        </div>
      </header>

      <PhaseNotices hunt={hunt} phase={phase} now={now} pending={stats.pending} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="@container flex min-w-0 flex-col gap-8">
          {settingUp && organizer ? <SetupChecklist steps={steps} publishSlot={publish} /> : null}
          {settingUp && !organizer && hunt.status === "draft" ? (
            <Notice tone="info" title="Still being set up">
              The organizers haven’t published this hunt yet. Submissions to judge will show up here once it runs.
            </Notice>
          ) : null}

          {phase !== "draft" ? <StatsRow stats={stats} huntId={hunt.id} phase={phase} /> : null}

          {/* Side by side only when the column is wide enough for both lists to breathe. */}
          {phase === "live" || phase === "ended" || phase === "archived" ? (
            <div className="grid grid-cols-1 gap-8 @2xl:grid-cols-2">
              <LeaderboardMini standings={standings} huntId={hunt.id} />
              <ActivityFeed items={activity} huntId={hunt.id} now={now.getTime()} />
            </div>
          ) : null}
        </div>

        {phase === "ended" || phase === "archived" ? (
          <WrapUpPanel hunt={hunt} organizer={organizer} className="self-start lg:sticky lg:top-6" />
        ) : (
          <SharePanel
            huntId={hunt.id}
            huntName={hunt.name}
            slug={hunt.slug}
            joinCode={hunt.joinCode}
            joinUrl={joinUrl}
            host={new URL(base).host}
            isDraft={hunt.status === "draft"}
            live={phase === "live"}
            className="self-start lg:sticky lg:top-6"
          />
        )}
      </div>
    </div>
  );
}

function Clock({
  hunt,
  phase,
  now,
  archivedOn,
}: {
  hunt: Hunt;
  phase: HuntPhase;
  now: number;
  /** When an archived hunt was archived, if the activity log knows. */
  archivedOn: Date | null;
}) {
  const big = "text-5xl sm:text-6xl";
  if (phase === "live" && hunt.endsAt) {
    return (
      <div className="flex items-center gap-3">
        <FinishMark size={34} />
        <div>
          <PhaseClock target={hunt.endsAt.getTime()} serverNow={now} doneLabel="Time’s up" className={big} />
          <p className="mt-1 text-sm text-ink-2">left, ends {formatTime(hunt.endsAt, hunt.timezone)}</p>
        </div>
      </div>
    );
  }
  if ((phase === "upcoming" || phase === "draft") && hunt.startsAt && hunt.startsAt.getTime() > now) {
    return (
      <div className="flex items-center gap-3">
        <StartMark size={34} />
        <div>
          <p className="text-sm text-ink-2">{phase === "draft" ? "Planned start in" : "Starts in"}</p>
          <PhaseClock target={hunt.startsAt.getTime()} serverNow={now} doneLabel="Starting" className={big} />
        </div>
      </div>
    );
  }
  if (phase === "ended" || phase === "archived") {
    // An archived hunt may have been filed away before its end time, or never had one.
    const endedAt = hunt.endsAt && hunt.endsAt.getTime() <= now ? hunt.endsAt : null;
    if (!endedAt && phase === "ended") return null;
    return (
      <div className="flex items-center gap-3">
        <FinishMark size={34} />
        <p className="text-ink-2">
          {endedAt ? (
            <>
              Finished <span className="block font-semibold text-ink">{formatDateTime(endedAt, hunt.timezone)}</span>
            </>
          ) : archivedOn ? (
            <>
              Archived <span className="block font-semibold text-ink">{formatDateTime(archivedOn, hunt.timezone)}</span>
            </>
          ) : (
            <span className="font-semibold text-ink">Archived</span>
          )}
        </p>
      </div>
    );
  }
  if (phase === "live") return <p className="text-sm text-ink-2">Running, with no end time set.</p>;
  if (phase === "draft" && hunt.startsAt)
    return <p className="text-sm text-ink-2">The planned start time has passed.</p>;
  return null;
}

function PrimaryAction({
  hunt,
  phase,
  organizer,
  stats,
  now,
}: {
  hunt: Hunt;
  phase: HuntPhase;
  organizer: boolean;
  stats: HuntStats;
  now: Date;
}) {
  if (phase === "draft") {
    if (!organizer) return null;
    if (stats.tasks === 0) {
      return (
        <ButtonLink href={`/manage/${hunt.id}/tasks/new`}>
          <ListPlus aria-hidden />
          Add the first task
        </ButtonLink>
      );
    }
    return <PublishButton huntId={hunt.id} huntName={hunt.name} consequence={publishConsequence(hunt, now)} />;
  }
  if (phase === "upcoming") {
    return (
      <ButtonLink href={`/manage/${hunt.id}/print/poster`}>
        <Printer aria-hidden />
        Print the join poster
      </ButtonLink>
    );
  }
  if (phase === "live") {
    return (
      <ButtonLink href={`/manage/${hunt.id}/judge`}>
        <Gavel aria-hidden />
        Open judging queue{stats.pending > 0 ? ` (${stats.pending})` : ""}
      </ButtonLink>
    );
  }
  if (phase === "ended" && stats.pending > 0) {
    // The results aren't final while submissions wait for a decision.
    return (
      <ButtonLink href={`/manage/${hunt.id}/judge`}>
        <Gavel aria-hidden />
        Finish judging ({stats.pending})
      </ButtonLink>
    );
  }
  return (
    <ButtonLink href={`/manage/${hunt.id}/scoreboard`}>
      <Trophy aria-hidden />
      See final results
    </ButtonLink>
  );
}

function PhaseNotices({ hunt, phase, now, pending }: { hunt: Hunt; phase: HuntPhase; now: Date; pending: number }) {
  if (phase === "ended" && pending > 0) {
    return (
      <Notice
        tone="warning"
        icon={<StatusGlyph status="pending" className="size-4" />}
        title={`${pending} ${pending === 1 ? "submission is" : "submissions are"} still waiting for a judge`}
      >
        The results aren’t final until every submission is accepted or rejected. The scoreboard updates as you go.
      </Notice>
    );
  }
  if (phase === "archived") {
    return (
      <Notice tone="info" icon={<Archive className="size-4" />} title="Archived">
        Players can still see the results. Nothing more can be submitted, and its tasks, teams and scores are read-only.
        Restore it from Settings to change them.
      </Notice>
    );
  }
  if (phase === "live" && hunt.freezeAt) {
    const at = formatTime(hunt.freezeAt, hunt.timezone);
    return now >= hunt.freezeAt ? (
      <Notice tone="warning" icon={<Snowflake className="size-4" />} title={`Scoreboard frozen at ${at}`}>
        Players and the big screen see the standings as they were at {at}. You see live scores below. The freeze lifts
        when the hunt ends.
      </Notice>
    ) : (
      <Notice tone="info" icon={<Snowflake className="size-4" />} title={`Scoreboard freezes at ${at}`}>
        From then on players see the standings as of {at}, and the final result is revealed when the hunt ends.
      </Notice>
    );
  }
  return null;
}

/** The hunt at a glance. "To review" is the one figure that asks for something, so it's highlighted and linked. */
function StatsRow({ stats, huntId, phase }: { stats: HuntStats; huntId: string; phase: HuntPhase }) {
  return (
    <StatStrip label="At a glance">
      <StatCell
        value={stats.teams}
        caption={
          <>
            {stats.teams === 1 ? "Team" : "Teams"}
            {stats.hiddenTeams > 0 ? <span className="text-ink-3">+{stats.hiddenTeams} hidden</span> : null}
          </>
        }
      />
      <StatCell value={stats.players} caption={stats.players === 1 ? "Player" : "Players"} />
      {phase === "upcoming" ? null : (
        <>
          <StatCell
            value={stats.pending}
            href={`/manage/${huntId}/judge`}
            highlight={stats.pending > 0}
            caption={
              <>
                <StatusGlyph status="pending" /> To review
              </>
            }
          />
          <StatCell
            value={stats.approved}
            caption={
              <>
                <StatusGlyph status="approved" className="text-forest" /> Accepted
              </>
            }
          />
          <StatCell
            value={stats.rejected}
            caption={
              <>
                <StatusGlyph status="rejected" className="text-danger" /> Not accepted
              </>
            }
          />
        </>
      )}
    </StatStrip>
  );
}
