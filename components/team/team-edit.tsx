"use client";

import { Pencil } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { formSummary, toastTitle, useFocusFirstError } from "@/components/join/form-feedback";
import { ColorPicker, EmojiPicker, TeamPreview } from "@/components/join/team-look-picker";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { FormMessage, fieldError, SubmitButton } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/actions";
import type { Team } from "@/lib/db/schema";
import { updateTeam } from "@/lib/player/actions";
import { TEAM_NAME_MAX } from "@/lib/player/join";
import { useActionDone } from "./use-action-done";

/** Captain only: rename the team and change its emoji and color. */
export function TeamEditButton({ huntId, team }: { huntId: string; team: Pick<Team, "name" | "emoji" | "color"> }) {
  const [open, setOpen] = useState(false);
  // A fresh form (and state) every time the dialog opens.
  const [session, setSession] = useState(0);
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
      >
        <Pencil aria-hidden />
        Edit team
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Edit team"
        description="Changes show up on the scoreboard right away."
      >
        {open ? <TeamEditForm key={session} huntId={huntId} team={team} onDone={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  );
}

function TeamEditForm({
  huntId,
  team,
  onDone,
}: {
  huntId: string;
  team: Pick<Team, "name" | "emoji" | "color">;
  onDone: () => void;
}) {
  const [state, action] = useActionState<ActionState, FormData>(updateTeam, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(team.name);
  const [emoji, setEmoji] = useState(team.emoji);
  const [color, setColor] = useState(team.color);
  const suggestion = fieldError(state, "nameSuggestion");

  useFocusFirstError(formRef, state);
  useActionDone(state, (message) => {
    toast({ title: toastTitle(message, "Team updated"), tone: "success" });
    onDone();
  });

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-6 pb-2" noValidate>
      <input type="hidden" name="huntId" value={huntId} />
      <TeamPreview name={name} emoji={emoji} color={color} placeholder="Team name" />
      <div className="flex flex-col gap-2">
        <Field label="Team name" error={fieldError(state, "name")}>
          {(p) => (
            <Input
              {...p}
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={TEAM_NAME_MAX + 8}
              autoComplete="off"
              required
            />
          )}
        </Field>
        {suggestion ? (
          <Button variant="quiet" size="sm" className="self-start" onClick={() => setName(suggestion)}>
            Use “{suggestion}”
          </Button>
        ) : null}
      </div>
      <EmojiPicker value={emoji} onChange={setEmoji} error={fieldError(state, "emoji")} />
      <ColorPicker value={color} onChange={setColor} error={fieldError(state, "color")} />
      <FormMessage state={state?.ok ? null : formSummary(state, ["name", "emoji", "color"])} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="lg" pendingLabel="Saving">
          Save changes
        </SubmitButton>
        <Button variant="ghost" size="lg" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
