import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { JoinTeamForm } from "@/components/join/join-forms";
import { ReclaimList } from "@/components/join/reclaim-list";
import { ButtonLink } from "@/components/ui/button";
import { ContourArt } from "@/components/ui/contour-art";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/misc";
import { TeamAvatar } from "@/components/ui/team-badge";
import { getPlayerHunt } from "@/lib/auth/access";
import { canViewScoreboard, getHuntBySlug, huntPhase } from "@/lib/hunts";
import { formatCode, normalizeCode } from "@/lib/ids";
import { joinPolicy, safeNextPath } from "@/lib/player/join";
import { codeGuard, getTeamByCode, getTeamMembers, leavingOutcome } from "@/lib/player/queries";
import { links } from "@/lib/url";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const hunt = await getHuntBySlug(slug);
  return hunt && hunt.status !== "draft" ? { title: { absolute: `Join a team – ${hunt.name}` } } : {};
}

/** Team invite link (from the team QR): join this team, or pick your name if you're already on it. */
export default async function TeamInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; teamCode: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug, teamCode }, query] = await Promise.all([params, searchParams]);
  const { hunt, me } = await getPlayerHunt(slug);
  const code = normalizeCode(safeDecode(teamCode)).slice(0, 12);
  const nextParam = Array.isArray(query.next) ? query.next[0] : query.next;
  const next = safeNextPath(nextParam, hunt.slug);

  // Only wrong codes count toward the limit, so a whole crowd can open invites at once.
  const guard = await codeGuard("team");
  const blocked = guard.retryAfterSec > 0;
  const team = blocked ? null : await getTeamByCode(hunt.id, code);
  if (team && me?.team.id === team.id) redirect(next ?? links.hunt(hunt.slug));

  if (!team) {
    if (!blocked) guard.miss();
    const policy = joinPolicy(hunt, huntPhase(hunt));
    return (
      <div className="mx-auto flex max-w-md flex-col gap-2">
        <h1 className="sr-only">Join a team in {hunt.name}</h1>
        <EmptyState title={blocked ? "Too many tries" : "That team code didn’t work"}>
          {!blocked ? (
            <>
              No team in {hunt.name} uses{" "}
              <span className="font-bib text-[1.15em] leading-none whitespace-nowrap text-ink">
                {formatCode(code) || "that code"}
              </span>
              . Check it with your teammates and fix it below.
            </>
          ) : (
            "Too many wrong codes were tried from this network. Wait a minute, then open the link again."
          )}
        </EmptyState>
        {!blocked && !policy.closed ? (
          <JoinTeamForm
            huntId={hunt.id}
            next={next}
            currentTeamName={null}
            defaultCode={code}
            defaultName={me?.player.name}
          />
        ) : null}
        <p className="mt-4 text-center text-sm text-ink-2">
          {me ? "Or go back to " : "Or open "}
          <Link href={links.hunt(hunt.slug)} className="font-semibold text-ink underline underline-offset-2">
            {hunt.name}
          </Link>
          {me ? "." : policy.canCreateTeam ? " to start a team of your own." : " to see what’s on."}
        </p>
      </div>
    );
  }

  const moving = me && me.team.id !== team.id ? me : null;
  const [members, currentTeamOutcome] = await Promise.all([
    getTeamMembers(team.id),
    moving ? leavingOutcome(moving.team.id, moving.player.id) : undefined,
  ]);
  const phase = huntPhase(hunt);
  const policy = joinPolicy(hunt, phase);
  const full = hunt.maxTeamSize != null && members.length >= hunt.maxTeamSize;
  const detached = members.filter((m) => m.sessionId == null).map((m) => ({ id: m.id, name: m.name }));
  const currentTeamName = moving?.team.name ?? null;
  const scoreboard = canViewScoreboard(hunt, { isStaff: false, isPlayer: !!me });

  return (
    <div className="flex flex-col gap-10">
      <section className="relative -mx-4 -mt-5 overflow-hidden border-b border-line px-4 pt-10 pb-8 text-center sm:mx-0 sm:mt-0 sm:rounded-xl sm:border">
        <ContourArt seed={hunt.id} strength="faint" />
        <div className="relative flex flex-col items-center">
          <p className="font-medium text-ink-2">You’re invited to join</p>
          <TeamAvatar team={team} size="xl" className="mt-4 size-24 text-6xl" />
          <h1 className="mt-4 font-cond text-5xl leading-none font-extrabold tracking-tight break-words sm:text-6xl">
            {team.name}
          </h1>
          <p className="mt-2 text-ink-2">
            in{" "}
            <Link href={links.hunt(hunt.slug)} className="font-semibold text-ink underline-offset-2 hover:underline">
              {hunt.name}
            </Link>
          </p>
          <p className="mt-4 max-w-sm text-sm text-ink-2">
            {members.length === 0
              ? "Nobody’s on this team yet, so you’ll be its captain."
              : `On the team: ${members.map((m) => (m.isCaptain ? `${m.name} (captain)` : m.name)).join(", ")}`}
          </p>
        </div>
      </section>

      {policy.closed ? (
        <div className="flex flex-col items-start gap-3">
          <Notice tone="info" title="This hunt has finished" className="w-full">
            Teams can’t take new members any more.
          </Notice>
          {scoreboard ? <ButtonLink href={links.scoreboard(hunt.slug)}>See the final scoreboard</ButtonLink> : null}
        </div>
      ) : full ? (
        <Notice tone="warning" title={`${team.name} is full`}>
          Teams in this hunt have up to {hunt.maxTeamSize} players.{" "}
          {policy.canCreateTeam && !me ? (
            <>
              Ask the captain to make room, or{" "}
              <Link href={links.hunt(hunt.slug)} className="font-semibold text-ink underline underline-offset-2">
                start your own team
              </Link>
              .
            </>
          ) : (
            "Ask the captain to make room."
          )}
        </Notice>
      ) : (
        <section aria-label={`Join ${team.name}`} className="w-full sm:max-w-md">
          <JoinTeamForm
            huntId={hunt.id}
            next={next}
            team={{ code: team.code, name: team.name }}
            currentTeamName={currentTeamName}
            currentTeamOutcome={currentTeamOutcome}
            defaultName={me?.player.name}
            submitLabel={`Join ${team.name}`}
          />
        </section>
      )}

      {policy.closed ? null : (
        <ReclaimList
          huntId={hunt.id}
          teamCode={team.code}
          teamName={team.name}
          members={detached}
          currentTeamName={currentTeamName}
          currentTeamOutcome={currentTeamOutcome}
          next={next}
        />
      )}
    </div>
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
