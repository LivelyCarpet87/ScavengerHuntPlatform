import type { ReactNode } from "react";
import type { Hunt, Player, Team } from "@/lib/db/schema";
import { InviteCard } from "./invite-card";

/**
 * "Invite teammates" with the team's invite card — or, once the team has as
 * many players as the hunt allows, a note saying so instead of an invite
 * nobody can use. A full team still shows its code while a member isn't
 * signed in on any device: that's how they pick their name again on a new
 * phone.
 */
export function TeamInviteSection({
  hunt,
  team,
  members,
  makeRoom,
}: {
  hunt: Pick<Hunt, "slug" | "name" | "maxTeamSize">;
  team: Pick<Team, "name" | "code">;
  members: Pick<Player, "name" | "sessionId">[];
  /** How the viewer can make room on a full team (the captain's hint), if they can. */
  makeRoom?: ReactNode;
}) {
  const max = hunt.maxTeamSize;
  const full = max != null && members.length >= max;
  const signedOut = members.filter((m) => m.sessionId == null).map((m) => m.name);

  return (
    <section aria-labelledby="invite-heading" className="flex flex-col gap-3">
      <h2 id="invite-heading" className="font-cond text-2xl font-bold tracking-tight">
        {full ? "Your team is full" : "Invite teammates"}
      </h2>
      {full ? (
        <p className="max-w-prose text-ink-2">
          {team.name} has {members.length} of {max} players, the most this hunt allows, so nobody else can join.
          {makeRoom ? <> {makeRoom}</> : null}
        </p>
      ) : null}
      {full && signedOut.length > 0 ? (
        <p className="max-w-prose text-ink-2">
          {listNames(signedOut)} {signedOut.length === 1 ? "isn’t" : "aren’t"} signed in on any device. To carry on from
          a new phone, they scan this QR code or open the invite link, then pick their name.
        </p>
      ) : null}
      {!full ? <InviteCard hunt={hunt} team={team} /> : null}
      {full && signedOut.length > 0 ? (
        <InviteCard
          hunt={hunt}
          team={team}
          hint="Scan the QR code or open the invite link, then pick your name under “Already on this team?”."
        />
      ) : null}
    </section>
  );
}

/** "Kim", "Kim and Lee", "Kim, Lee and Ana". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
