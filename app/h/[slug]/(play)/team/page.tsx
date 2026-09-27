import type { Metadata } from "next";
import { LiveRefresh } from "@/components/live/live-refresh";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { PushToggle } from "@/components/pwa/push-toggle";
import { InviteCard } from "@/components/team/invite-card";
import { LeaveTeam } from "@/components/team/leave-team";
import { MemberList } from "@/components/team/member-list";
import { MyNameForm } from "@/components/team/my-name-form";
import { TeamEditButton } from "@/components/team/team-edit";
import { Notice } from "@/components/ui/misc";
import { TeamAvatar } from "@/components/ui/team-badge";
import { requirePlayer } from "@/lib/auth/access";
import { plural } from "@/lib/format";
import { getHuntBySlug, huntPhase } from "@/lib/hunts";
import { getTeamMembers } from "@/lib/player/queries";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const hunt = await getHuntBySlug(slug);
  return hunt && hunt.status !== "draft" ? { title: { absolute: `Team – ${hunt.name}` } } : {};
}

/** The team: who's on it, how to invite more, and the captain's controls. */
export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { hunt, me } = await requirePlayer(slug);
  const members = await getTeamMembers(me.team.id);
  const phase = huntPhase(hunt);
  const locked = phase === "ended" || phase === "archived";
  const isCaptain = me.player.isCaptain;
  const others = members.filter((m) => m.id !== me.player.id);
  const nextCaptain = isCaptain ? ((others.find((m) => m.sessionId) ?? others[0])?.name ?? null) : null;
  const captain = members.find((m) => m.isCaptain);

  return (
    <div className="flex flex-col gap-10">
      <LiveRefresh huntId={hunt.id} on={["teams.changed", "hunt.changed"]} />

      <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <TeamAvatar team={me.team} size="xl" />
          <div className="min-w-0">
            <h1 className="font-cond text-4xl leading-none font-extrabold tracking-tight break-words sm:text-5xl">
              {me.team.name}
            </h1>
            <p className="mt-2 text-ink-2">
              {hunt.maxTeamSize ? `${members.length} of ${hunt.maxTeamSize} players` : plural(members.length, "player")}{" "}
              in {hunt.name}
            </p>
          </div>
        </div>
        {isCaptain && !locked ? <TeamEditButton huntId={hunt.id} team={me.team} /> : null}
      </header>

      {locked ? (
        <Notice tone="info" title="The hunt is over">
          Your team is final: names, members and captain can’t change any more.
        </Notice>
      ) : (
        <section aria-labelledby="invite-heading" className="flex flex-col gap-3">
          <h2 id="invite-heading" className="font-cond text-2xl font-bold tracking-tight">
            Invite teammates
          </h2>
          <InviteCard hunt={hunt} team={me.team} />
        </section>
      )}

      <section aria-labelledby="members-heading" className="flex flex-col gap-2">
        <h2 id="members-heading" className="font-cond text-2xl font-bold tracking-tight">
          Members
        </h2>
        <MemberList
          huntId={hunt.id}
          meId={me.player.id}
          canManage={isCaptain && !locked}
          members={members.map((m) => ({
            id: m.id,
            name: m.name,
            isCaptain: m.isCaptain,
            signedIn: m.sessionId != null,
          }))}
        />
        {!isCaptain && captain && !locked ? (
          <p className="text-sm text-ink-2">{captain.name} is captain: they can edit the team and manage members.</p>
        ) : null}
        {!locked ? (
          <div className="mt-6">
            <MyNameForm huntId={hunt.id} name={me.player.name} />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="notify-heading" className="flex flex-col gap-3">
        <h2 id="notify-heading" className="font-cond text-2xl font-bold tracking-tight">
          Notifications
        </h2>
        <p className="max-w-prose text-ink-2">
          Notifications are set per phone, so each teammate turns them on for their own device.
        </p>
        <PushToggle />
      </section>

      <InstallPrompt />

      {!locked ? (
        <div className="border-t border-line pt-6">
          <LeaveTeam
            huntId={hunt.id}
            teamName={me.team.name}
            nextCaptain={nextCaptain}
            lastMember={others.length === 0}
          />
        </div>
      ) : null}
    </div>
  );
}
