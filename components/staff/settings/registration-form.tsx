"use client";

import { Button } from "@/components/ui/button";
import { ChoiceCards } from "@/components/ui/choice";
import { Field, Input, Switch } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form";
import { formLevel } from "@/lib/staff/forms";
import { updateRegistrationAction } from "@/lib/staff/hunt-actions";
import { useActionForm } from "../use-action-form";

/** How players get into the hunt and into teams. */
export function RegistrationForm({
  huntId,
  values,
}: {
  huntId: string;
  values: {
    joinMode: "code" | "open";
    teamCreation: "players" | "organizers";
    registrationOpen: boolean;
    maxTeamSize: number | null;
  };
}) {
  const { state, pending, onSubmit, formRef } = useActionForm(updateRegistrationAction);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-6">
      <input type="hidden" name="huntId" value={huntId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Finding the hunt</legend>
        <ChoiceCards
          name="joinMode"
          defaultValue={values.joinMode}
          options={[
            {
              value: "code",
              label: "Hunt code needed",
              description: "Players type the six-digit code or scan the poster’s QR to find the hunt.",
            },
            {
              value: "open",
              label: "Open link",
              description: "Anyone with the hunt’s link can register, no code needed.",
            },
          ]}
        />
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Who creates teams</legend>
        <ChoiceCards
          name="teamCreation"
          defaultValue={values.teamCreation}
          options={[
            {
              value: "players",
              label: "Players",
              description: "The first player names the team; teammates join with its team code.",
            },
            {
              value: "organizers",
              label: "Organizers only",
              description: "You add the teams and hand out team cards. Players join with a team code.",
            },
          ]}
        />
      </fieldset>
      <Switch
        name="registrationOpen"
        defaultChecked={values.registrationOpen}
        label="Registration open"
        hint="When off, nobody can register a new team or join with the hunt code. Team codes still work."
      />
      <Field
        label="Largest team"
        hint="Leave empty for no limit."
        error={fieldError(state, "maxTeamSize")}
        className="max-w-xs"
      >
        {(p) => (
          <Input
            {...p}
            name="maxTeamSize"
            inputMode="numeric"
            defaultValue={values.maxTeamSize ?? ""}
            placeholder="No limit"
          />
        )}
      </Field>
      <FormMessage state={formLevel(state, ["maxTeamSize"])} />
      <Button type="submit" variant="secondary" pending={pending} className="self-start">
        Save registration
      </Button>
    </form>
  );
}
