"use client";

import { LogOut } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import type { ActionState } from "@/lib/actions";
import { leaveTeam } from "@/lib/player/actions";

/** Leave the team on this device, after saying plainly what happens. */
export function LeaveTeam({
  huntId,
  teamName,
  nextCaptain,
  lastMember,
}: {
  huntId: string;
  teamName: string;
  /** Who takes over when the captain leaves; null when the viewer isn't captain. */
  nextCaptain: string | null;
  lastMember: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(leaveTeam, null);
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
        <form action={action} className="flex flex-col gap-4 pb-2">
          <input type="hidden" name="huntId" value={huntId} />
          <div className="flex flex-col gap-2 text-[0.9375rem] text-ink-2">
            <p>
              {teamName} keeps its points and everything it has sent. You can come back any time with the team code.
            </p>
            {lastMember ? (
              <p>You’re the last member, so the team will have nobody on it. It stays on the scoreboard.</p>
            ) : nextCaptain ? (
              <p>
                <span className="font-semibold text-ink">{nextCaptain}</span> becomes captain.
              </p>
            ) : null}
          </div>
          <FormMessage state={state} />
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="danger" pendingLabel="Leaving">
              Leave team
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
