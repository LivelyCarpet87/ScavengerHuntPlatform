import { Gavel, MonitorPlay, Trophy } from "lucide-react";
import Link from "next/link";
import { HuntPhaseChip } from "@/components/shells/staff-shell";
import { Numeral } from "@/components/ui/bib";
import { ButtonLink } from "@/components/ui/button";
import { FinishMark, StartMark } from "@/components/ui/control";
import { Countdown } from "@/components/ui/countdown";
import { StatusGlyph } from "@/components/ui/status";
import { TeamAvatar } from "@/components/ui/team-badge";
import { roleAtLeast } from "@/lib/auth/access";
import { formatDate, formatPoints, plural } from "@/lib/format";
import { formatSchedule } from "@/lib/staff/format";
import type { DashboardHunt } from "@/lib/staff/queries";
import { links } from "@/lib/url";
import { cn } from "@/lib/utils";
import { DuplicateHuntButton } from "./duplicate-hunt-button";
import { HuntMap } from "./hunt-map";

/*
 * Hunts on the dashboard are objects, so they're cards — in three sizes, so
 * the page has a hierarchy instead of a uniform grid: live hunts get a wide
 * map sheet, drafts and upcoming hunts a standard card, finished ones a
 * compact row-card.
 */

export type Leader = { name: string; emoji: string; color: string; total: number } | null;

function Figure({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <dt className="order-2 text-xs font-medium text-ink-2">{label}</dt>
      <dd className="order-1 font-bib text-2xl leading-none">
        <Numeral>{value.toLocaleString("en-US")}</Numeral>
      </dd>
    </div>
  );
}

function PendingLink({ huntId, count, className }: { huntId: string; count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <Link
      href={`/manage/${huntId}/judge`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-sun-wash py-1 pr-2.5 pl-2 text-sm font-semibold text-sun-fg hover:underline",
        className,
      )}
    >
      <StatusGlyph status="pending" />
      {count} to review
    </Link>
  );
}

function HuntTitle({ item, className }: { item: DashboardHunt; className?: string }) {
  return (
    <h3 className={cn("min-w-0 font-cond font-extrabold tracking-tight text-balance wrap-anywhere", className)}>
      <Link href={links.manage(item.hunt.id)} className="hover:underline decoration-2 underline-offset-4">
        {item.hunt.name}
      </Link>
    </h3>
  );
}

function BigScreenLink({ slug, size = "sm" }: { slug: string; size?: "sm" | "md" }) {
  return (
    <ButtonLink href={links.screen(slug)} target="_blank" variant="ghost" size={size}>
      <MonitorPlay aria-hidden />
      Big screen
    </ButtonLink>
  );
}

/** A live hunt: wide map sheet with the clock, the review queue and the leader. */
export function LiveHuntCard({ item, leader, now }: { item: DashboardHunt; leader: Leader; now: number }) {
  const { hunt } = item;
  return (
    <article
      data-accent={hunt.accent}
      className="overflow-hidden rounded-xl border border-line bg-paper md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
    >
      <HuntMap
        seed={hunt.id}
        controls={item.taskCount}
        aspect={1.5}
        className="h-36 border-b border-line md:h-full md:min-h-64 md:border-r md:border-b-0"
      />
      <div className="flex min-w-0 flex-col gap-5 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <HuntPhaseChip hunt={hunt} />
            <HuntTitle item={item} className="mt-2 text-3xl sm:text-4xl" />
            <p className="mt-1 text-sm text-ink-2">{formatSchedule(hunt.startsAt, hunt.endsAt, hunt.timezone)}</p>
          </div>
          {hunt.endsAt ? (
            <div className="flex items-center gap-2.5">
              <FinishMark size={26} />
              <p className="flex flex-col">
                <Countdown
                  to={hunt.endsAt.getTime()}
                  serverNow={now}
                  doneLabel="Time’s up"
                  className="text-4xl leading-none"
                />
                <span className="text-xs font-medium text-ink-2">left</span>
              </p>
            </div>
          ) : null}
        </div>

        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <Figure label="Teams" value={item.teamCount} />
          <Figure label="Players" value={item.playerCount} />
          <Figure label="Tasks" value={item.taskCount} />
        </dl>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <PendingLink huntId={hunt.id} count={item.pendingCount} />
          {leader ? (
            <p className="flex min-w-0 items-center gap-2 text-sm">
              <TeamAvatar team={leader} size="sm" />
              <span className="min-w-0 truncate">
                <span className="font-semibold">{leader.name}</span> leads with{" "}
                <Numeral className="text-base">{formatPoints(leader.total)}</Numeral>
              </span>
            </p>
          ) : (
            <p className="text-sm text-ink-2">No points on the board yet.</p>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2">
          <ButtonLink href={links.manage(hunt.id)} variant="secondary" size="sm">
            Manage
          </ButtonLink>
          <ButtonLink href={`/manage/${hunt.id}/judge`} variant="ghost" size="sm">
            <Gavel aria-hidden />
            Judge
          </ButtonLink>
          <BigScreenLink slug={hunt.slug} />
          {roleAtLeast(item.role, "organizer") ? <DuplicateHuntButton huntId={hunt.id} huntName={hunt.name} /> : null}
        </div>
      </div>
    </article>
  );
}

/** A draft or upcoming hunt. */
export function HuntCard({ item }: { item: DashboardHunt }) {
  const { hunt } = item;
  return (
    <article data-accent={hunt.accent} className="flex flex-col overflow-hidden rounded-lg border border-line bg-paper">
      <HuntMap seed={hunt.id} controls={item.taskCount} aspect={3} className="h-24 border-b border-line" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <HuntTitle item={item} className="text-2xl" />
          <HuntPhaseChip hunt={hunt} className="mt-1 shrink-0" />
        </div>
        <p className="flex items-start gap-2 text-sm text-ink-2">
          <StartMark size={16} className="mt-0.5" />
          {formatSchedule(hunt.startsAt, hunt.endsAt, hunt.timezone)}
        </p>
        <dl className="flex flex-wrap gap-x-7 gap-y-2">
          <Figure label="Tasks" value={item.taskCount} />
          <Figure label="Teams" value={item.teamCount} />
          <Figure label="Players" value={item.playerCount} />
        </dl>
        <PendingLink huntId={hunt.id} count={item.pendingCount} className="self-start" />
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <ButtonLink href={links.manage(hunt.id)} variant="secondary" size="sm">
            {hunt.status === "draft" && roleAtLeast(item.role, "organizer") ? "Continue setup" : "Manage"}
          </ButtonLink>
          {hunt.status !== "draft" ? <BigScreenLink slug={hunt.slug} /> : null}
          {roleAtLeast(item.role, "organizer") ? <DuplicateHuntButton huntId={hunt.id} huntName={hunt.name} /> : null}
        </div>
      </div>
    </article>
  );
}

/** A finished or archived hunt, with its winner (and anything still waiting for a judge). */
export function CompactHuntCard({ item, winner }: { item: DashboardHunt; winner: Leader }) {
  const { hunt } = item;
  const when = hunt.endsAt ?? hunt.startsAt;
  return (
    <article data-accent={hunt.accent} className="flex overflow-hidden rounded-lg border border-line bg-paper">
      <HuntMap
        seed={hunt.id}
        controls={item.taskCount}
        aspect={0.9}
        ringSize={6}
        strength="faint"
        className="w-20 shrink-0 border-r border-line sm:w-28"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <HuntTitle item={item} className="text-xl" />
          <HuntPhaseChip hunt={hunt} className="mt-0.5 shrink-0" />
        </div>
        <p className="flex flex-wrap gap-x-3 text-sm text-ink-2">
          <span>{when ? formatDate(when, hunt.timezone) : "No date set"}</span>
          <span className="sr-only">,</span>
          <span>{plural(item.teamCount, "team")}</span>
          <span className="sr-only">,</span>
          <span>{plural(item.playerCount, "player")}</span>
        </p>
        {winner ? (
          <p className="flex min-w-0 items-center gap-2 text-sm">
            <Trophy aria-hidden className="size-4 shrink-0 text-ink-2" />
            {/* Until every submission is judged the result isn't final, so it's a lead, not a win. */}
            <span className="min-w-0 truncate">
              {item.pendingCount > 0 ? "Leading: " : "Won by "}
              {winner.emoji} <span className="font-semibold">{winner.name}</span> with{" "}
              <Numeral className="text-base">{formatPoints(winner.total)}</Numeral>
            </span>
          </p>
        ) : null}
        <PendingLink huntId={hunt.id} count={item.pendingCount} className="mt-0.5 self-start" />
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <ButtonLink href={links.manage(hunt.id)} variant="quiet" size="sm">
            Manage
          </ButtonLink>
          <BigScreenLink slug={hunt.slug} />
          {roleAtLeast(item.role, "organizer") ? (
            <DuplicateHuntButton huntId={hunt.id} huntName={hunt.name} label="Run it again" />
          ) : null}
        </div>
      </div>
    </article>
  );
}
