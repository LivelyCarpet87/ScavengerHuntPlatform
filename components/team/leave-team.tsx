"use client";

import { LogOut } from "lucide-react";
import { useParams } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { noteLeftTeam, undoLeftTeam } from "@/components/join/device-team";
import { forgetThisDevice } from "@/components/pwa/forget";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import type { ActionState } from "@/lib/actions";
import { leaveTeam } from "@/lib/player/actions";
import type { LeavingOutcome } from "@/lib/player/queries";

/** Leave the team on this device, after saying plainly what happens. */
export function LeaveTeam({
  huntId,
  teamName,
  nextCaptain,
  outcome,
}: {
  huntId: string;
  teamName: string;
  /** Who takes over when the captain leaves; null when the viewer isn't captain. */
  nextCaptain: string | null;
  /** What happens to the team once this player is off it. */
  outcome: LeavingOutcome;
}) {
  const [open, setOpen] = useState(false);
  const { slug } = useParams<{ slug: string }>();
  const [state, action] = useActionState<ActionState, FormData>(leaveTeam, null);
  const removed = outcome === "removed";
  // Success navigates away; a refusal (say, the hunt just ended) means this phone is still on the team.
  useEffect(() => {
    if (state && !state.ok) undoLeftTeam(huntId);
  }, [state, huntId]);
  return (
    <>
      <Button
        variant="ghost"
        className="self-start px-2 text-danger hover:bg-danger-wash"
        onClick={() => setOpen(true)}
      >
        <LogOut aria-hidden />
        Leave team
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Leave ${teamName}?`}>
        {/* The hunt page confirms with "You left …" rather than explaining a signed-out phone. */}
        <form
          action={action}
          onSubmit={() => {
            noteLeftTeam(huntId, teamName);
            // The next person on this phone mustn't open the team page (and its code) offline.
            void forgetThisDevice(slug);
          }}
          className="flex flex-col gap-4 pb-2"
        >
          <input type="hidden" name="huntId" value={huntId} />
          <div className="flex flex-col gap-2 text-[0.9375rem] text-ink-2">
            {removed ? (
              <p>
                You’re the last member and {teamName} hasn’t sent anything yet, so leaving removes the team. Its name
                becomes free for anyone to use.
              </p>
            ) : (
              <p>
                {teamName} keeps its points and everything it has sent. You can come back any time with the team code.
              </p>
            )}
            {outcome === "empty" ? (
              <p>You’re the last member, so the team will have nobody on it. It stays on the scoreboard.</p>
            ) : outcome === "stays" && nextCaptain ? (
              <p>
                <span className="font-semibold text-ink">{nextCaptain}</span> becomes captain.
              </p>
            ) : null}
          </div>
          <FormMessage state={state} />
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="danger" pendingLabel="Leaving">
              {removed ? "Leave and remove team" : "Leave team"}
            </SubmitButton>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Stay on {teamName}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
