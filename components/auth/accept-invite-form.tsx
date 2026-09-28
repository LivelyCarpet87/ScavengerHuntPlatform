"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { acceptInviteAction } from "@/lib/platform/auth-actions";

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInviteAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full" pendingLabel="Accepting">
        Accept invite
      </SubmitButton>
    </form>
  );
}
