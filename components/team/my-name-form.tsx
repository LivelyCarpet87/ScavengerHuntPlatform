"use client";

import { useActionState, useState } from "react";
import { Field, Input } from "@/components/ui/field";
import { FormMessage, fieldError, SubmitButton } from "@/components/ui/form";
import type { ActionState } from "@/lib/actions";
import { updateMyName } from "@/lib/player/actions";
import { cleanName, PLAYER_NAME_MAX } from "@/lib/player/join";

/** Every member can change the name their teammates see. */
export function MyNameForm({ huntId, name }: { huntId: string; name: string }) {
  const [state, action] = useActionState<ActionState, FormData>(updateMyName, null);
  const [value, setValue] = useState(name);
  const unchanged = cleanName(value) === name;
  return (
    <form action={action} className="flex flex-col gap-3 sm:max-w-lg" noValidate>
      <input type="hidden" name="huntId" value={huntId} />
      <Field label="Your name" hint="What your teammates see." error={fieldError(state, "name")}>
        {(p) => (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              {...p}
              name="name"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={PLAYER_NAME_MAX + 8}
              autoComplete="given-name"
              required
              className="sm:flex-1"
            />
            <SubmitButton
              variant="secondary"
              size="md"
              className="h-12 self-start sm:self-auto"
              disabled={unchanged}
              pendingLabel="Saving"
            >
              Save name
            </SubmitButton>
          </div>
        )}
      </Field>
      {/* "Name saved" stays until the name is edited again. A problem with the name shows under the field. */}
      <FormMessage state={state?.ok ? (unchanged ? state : null) : state?.fieldErrors?.name ? null : state} />
    </form>
  );
}
