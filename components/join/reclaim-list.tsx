"use client";

import { ArrowLeftRight } from "lucide-react";
import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { type JoinTeamState, reclaimPlayer } from "@/lib/player/actions";
import type { LeavingOutcome } from "@/lib/player/queries";
import { leavingNote } from "./leaving-note";

/**
 * "Already on this team?" — members whose device was signed out (lost phone,
 * cleared browser). Picking a name puts that member back on this device.
 */
export function ReclaimList({
  huntId,
  teamCode,
  teamName,
  members,
  currentTeamName,
  currentTeamOutcome = "stays",
  next,
}: {
  huntId: string;
  teamCode: string;
  teamName: string;
  members: { id: string; name: string }[];
  /** The team this device is on now, if another one. */
  currentTeamName: string | null;
  /** What happens to that team when this device moves off it. */
  currentTeamOutcome?: LeavingOutcome;
  next: string | null;
}) {
  if (members.length === 0) return null;
  return (
    <section aria-labelledby="reclaim-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="reclaim-heading" className="font-cond text-2xl font-bold tracking-tight">
          Already on this team?
        </h2>
        <p className="mt-1 text-ink-2">
          If you joined {teamName} on another phone or cleared your browser, pick your name to carry on here.
        </p>
      </div>
      {currentTeamName ? (
        <Notice tone="warning" icon={<ArrowLeftRight className="size-4" />}>
          This device is on {currentTeamName} now. Picking a name here moves it to {teamName}.{" "}
          {leavingNote(currentTeamName, currentTeamOutcome)}
        </Notice>
      ) : null}
      <ul className="flex flex-wrap gap-2">
        {members.map((m) => (
          <li key={m.id}>
            <ReclaimButton huntId={huntId} teamCode={teamCode} member={m} confirmMove={!!currentTeamName} next={next} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReclaimButton({
  huntId,
  teamCode,
  member,
  confirmMove,
  next,
}: {
  huntId: string;
  teamCode: string;
  member: { id: string; name: string };
  confirmMove: boolean;
  next: string | null;
}) {
  const [state, action] = useActionState<JoinTeamState, FormData>(reclaimPlayer, null);
  // This device joined another team after the page loaded: ask once more.
  const asked = state?.ok ? state.data?.confirmMove : undefined;
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="huntId" value={huntId} />
      <input type="hidden" name="teamCode" value={teamCode} />
      <input type="hidden" name="playerId" value={member.id} />
      {confirmMove || asked ? <input type="hidden" name="confirmMove" value="1" /> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <SubmitButton variant="secondary" pendingLabel={`Signing in as ${member.name}`}>
        {asked ? `Move here as ${member.name}` : `I’m ${member.name}`}
      </SubmitButton>
      {asked ? (
        <p className="max-w-60 text-sm text-ink-2">
          This device is on {asked.from} now. Tap again to move it to {asked.to}.{" "}
          {leavingNote(asked.from, asked.fromOutcome)}
        </p>
      ) : null}
      <FormMessage state={state?.ok ? null : state} className="max-w-60" />
    </form>
  );
}
