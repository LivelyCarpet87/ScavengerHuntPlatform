import { ChevronRight, Images, Snowflake } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RefreshAt } from "@/components/home/refresh-at";
import { LiveRefresh } from "@/components/live/live-refresh";
import { RegisteredTeams } from "@/components/scoreboard/registered-teams";
import { ScoreboardBoard } from "@/components/scoreboard/scoreboard-board";
import { ButtonLink } from "@/components/ui/button";
import { FinishMark, StartMark } from "@/components/ui/control";
import { Countdown } from "@/components/ui/countdown";
import { EmptyState } from "@/components/ui/empty-state";
import { LiveDot, Notice } from "@/components/ui/misc";
import { getPlayerHunt } from "@/lib/auth/access";
import type { Hunt } from "@/lib/db/schema";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { canViewGallery, getHuntBySlug, huntPhase } from "@/lib/hunts";
import { loadStandings } from "@/lib/live/standings";
import { canSeeBoard } from "@/lib/live/viewer";
import { links } from "@/lib/url";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const hunt = await getHuntBySlug(slug);
  if (!hunt || hunt.status === "draft") return {};
  return { title: `${hunt.name} scoreboard` };
}

const DAY = 24 * 60 * 60 * 1000;

export default async function ScoreboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { hunt, me, staffRole } = await getPlayerHunt(slug);
  const viewer = { isStaff: !!staffRole, isPlayer: !!me };
  const now = new Date();
  const phase = huntPhase(hunt, now);
  const isVisitor = !viewer.isStaff && !viewer.isPlayer;
  const canJoin = isVisitor && (phase === "upcoming" || phase === "live");

  if (!canSeeBoard(hunt, viewer)) {
    return <LockedBoard hunt={hunt} isVisitor={isVisitor} canJoin={canJoin} />;
  }

  const { payload, cutoff } = await loadStandings(hunt, viewer, now);
  const galleryOpen = canViewGallery(hunt, viewer, now);
  const finished = phase === "ended" || phase === "archived";
  const started = phase === "live" || finished;
  const frozenForPlayers = phase === "live" && !!hunt.freezeAt && now >= hunt.freezeAt;
  const viewerTeamId = me?.team.id ?? null;

  return (
    <div className="flex flex-col gap-6">
      {/* Scores and teams update in place (ScoreboardBoard fetches the standings); the rest of the page follows the hunt. */}
      <LiveRefresh huntId={hunt.id} on={["hunt.changed"]} />
      {/* The start, the freeze and the finish happen on the clock: flip right on time. */}
      <RefreshAt at={[hunt.startsAt?.getTime(), hunt.freezeAt?.getTime(), hunt.endsAt?.getTime()]} />

      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 font-cond text-4xl font-extrabold tracking-tight">
            {finished ? <FinishMark size={30} /> : null}
            {finished ? "Final results" : "Scoreboard"}
          </h1>
          <StatusLine
            hunt={hunt}
            phase={phase}
            frozen={!!cutoff}
            now={now.getTime()}
            // Players already have the clock in the shell header.
            showCountdown={!me}
          />
        </div>
        {canJoin ? (
          <ButtonLink href={links.hunt(hunt.slug)} className="hidden md:inline-flex">
            Join this hunt
          </ButtonLink>
        ) : null}
      </header>

      {cutoff ? (
        <Notice
          tone="warning"
          icon={<Snowflake className="size-5" />}
          title={`Scoreboard frozen at ${formatTime(cutoff, hunt.timezone)}.`}
        >
          {hunt.endsAt
            ? `Final results appear when the hunt ends at ${formatTime(hunt.endsAt, hunt.timezone)}.`
            : "Final results appear when the hunt ends."}
        </Notice>
      ) : frozenForPlayers && viewer.isStaff && hunt.freezeAt ? (
        <Notice tone="info" icon={<Snowflake className="size-5" />} title="You’re seeing live scores.">
          Players see this board frozen at {formatTime(hunt.freezeAt, hunt.timezone)} until the hunt ends.
        </Notice>
      ) : null}

      {phase === "draft" ? (
        <Notice tone="info" title="This hunt is a draft.">
          Only staff can see it. Players see the scoreboard once it’s published and started.
        </Notice>
      ) : null}

      {started ? (
        <ScoreboardBoard
          huntId={hunt.id}
          timezone={hunt.timezone}
          rows={payload.standings}
          updatedAt={payload.updatedAt}
          viewerTeamId={viewerTeamId}
          live={phase === "live"}
        />
      ) : (
        <>
          <div className="flex items-start gap-3 rounded-lg bg-mist px-4 py-4">
            <StartMark size={26} className="mt-0.5" />
            <div className="min-w-0">
              <p className="font-semibold">Scores appear when the hunt starts.</p>
              {hunt.startsAt ? (
                <p className="mt-0.5 text-ink-2">
                  {hunt.startsAt.getTime() - now.getTime() < DAY ? (
                    <>
                      Starts in{" "}
                      <Countdown to={hunt.startsAt.getTime()} serverNow={now.getTime()} className="text-ink" />
                    </>
                  ) : (
                    `Starts ${formatDateTime(hunt.startsAt, hunt.timezone)}`
                  )}
                </p>
              ) : null}
            </div>
          </div>
          <RegisteredTeams
            huntId={hunt.id}
            rows={payload.standings}
            updatedAt={payload.updatedAt}
            viewerTeamId={viewerTeamId}
          />
        </>
      )}

      {galleryOpen && started ? (
        <Link
          href={`/h/${hunt.slug}/gallery`}
          className="group flex min-h-14 items-center gap-3 rounded-lg border border-line px-4 py-3 font-semibold hover:bg-mist"
        >
          <Images aria-hidden className="size-5 text-accent" />
          <span className="flex-1">{finished ? "See every accepted photo" : "Browse accepted photos"}</span>
          <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-3 transition-colors group-hover:text-ink" />
        </Link>
      ) : null}

      {canJoin ? (
        <div
          data-bottom-bar
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
        >
          <ButtonLink href={links.hunt(hunt.slug)} size="lg" className="w-full">
            Join this hunt
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );
}

function StatusLine({
  hunt,
  phase,
  frozen,
  now,
  showCountdown,
}: {
  hunt: Pick<Hunt, "endsAt" | "timezone">;
  phase: ReturnType<typeof huntPhase>;
  frozen: boolean;
  now: number;
  showCountdown: boolean;
}) {
  if (phase === "live" && (!frozen || showCountdown)) {
    return (
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-2">
        {/* When frozen, the notice below says so. */}
        {frozen ? null : <LiveDot />}
        {hunt.endsAt && showCountdown ? (
          <span>
            Ends in <Countdown to={hunt.endsAt.getTime()} serverNow={now} className="text-ink" />
          </span>
        ) : null}
      </p>
    );
  }
  if ((phase === "ended" || phase === "archived") && hunt.endsAt) {
    return (
      <p className="mt-1.5 text-ink-2">
        The hunt ended at {formatTime(hunt.endsAt, hunt.timezone)} on {formatDate(hunt.endsAt, hunt.timezone)}.
      </p>
    );
  }
  return null;
}

function LockedBoard({
  hunt,
  isVisitor,
  canJoin,
}: {
  hunt: Pick<Hunt, "slug" | "scoreboardVisibility">;
  isVisitor: boolean;
  canJoin: boolean;
}) {
  if (hunt.scoreboardVisibility === "players" && isVisitor) {
    return (
      <EmptyState
        title="The scoreboard is for teams in this hunt"
        action={canJoin ? <ButtonLink href={links.hunt(hunt.slug)}>Join this hunt</ButtonLink> : undefined}
      >
        {canJoin ? "Join a team to follow the standings live." : "Only the teams that took part can see the results."}
      </EmptyState>
    );
  }
  return (
    <EmptyState title="The organizers keep this scoreboard private">
      {isVisitor
        ? "Scores are only visible to the hunt’s staff."
        : "Scores are only visible to the hunt’s staff. Every accepted task still counts toward your team’s total."}
    </EmptyState>
  );
}
