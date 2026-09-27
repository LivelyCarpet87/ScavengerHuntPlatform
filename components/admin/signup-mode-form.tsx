"use client";

import { DoorOpen, Mail } from "lucide-react";
import { useActionState } from "react";
import { ChoiceCards } from "@/components/ui/choice";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { setSignupModeAction } from "@/lib/platform/admin-actions";
import type { SignupMode } from "@/lib/platform/settings";

export function SignupModeForm({ mode }: { mode: SignupMode }) {
  const [state, action] = useActionState(setSignupModeAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <ChoiceCards
        name="mode"
        defaultValue={mode}
        options={[
          {
            value: "invite",
            label: "Invite-only",
            description: "People need an invite link from an admin, or from a hunt's organizer to join its staff.",
            icon: <Mail className="size-5" />,
          },
          {
            value: "open",
            label: "Open",
            description: "Anyone who can reach this site can create an organizer account and start hunts.",
            icon: <DoorOpen className="size-5" />,
          },
        ]}
      />
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton variant="secondary" pendingLabel="Saving">
          Save sign-up setting
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
