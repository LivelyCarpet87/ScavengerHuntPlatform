"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { ColorPicker, EmojiPicker, TeamPreview } from "@/components/join/team-look-picker";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Switch } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { TEAM_EMOJI } from "@/lib/palette";
import { formLevel } from "@/lib/staff/forms";
import { updateTeamAction } from "@/lib/staff/team-actions";
import { useActionForm } from "../use-action-form";

type TeamLook = { id: string; name: string; emoji: string; color: string; hidden: boolean };

/**
 * "Edit team" for organizers: the same name, emoji and color controls players
 * see in their own Edit team sheet (so both look alike), plus hiding the team
 * from the scoreboard. Every opening starts from the saved team.
 */
export function TeamEditButton({ huntId, team }: { huntId: string; team: TeamLook }) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setRound((r) => r + 1);
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
        description="Changes show on the scoreboard and on players’ phones straight away."
      >
        {open ? <TeamForm key={round} huntId={huntId} team={team} onDone={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  );
}

function TeamForm({ huntId, team, onDone }: { huntId: string; team: TeamLook; onDone: () => void }) {
  const [name, setName] = useState(team.name);
  const [emoji, setEmoji] = useState(team.emoji);
  const [color, setColor] = useState(team.color);
  const { state, pending, onSubmit, formRef } = useActionForm(updateTeamAction, {
    onSuccess: (s) => {
      if (s?.ok) toast({ title: s.message ?? "Team saved.", tone: "success" });
      onDone();
    },
  });

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-6 pb-2" noValidate>
      <input type="hidden" name="huntId" value={huntId} />
      <input type="hidden" name="teamId" value={team.id} />
      {/* An emoji from outside today's list (an older team) is kept until another one is picked. */}
      {TEAM_EMOJI.includes(emoji) ? null : <input type="hidden" name="emoji" value={emoji} />}
      <TeamPreview name={name} emoji={emoji} color={color} placeholder="Team name" />
      <Field label="Team name" error={fieldError(state, "name")}>
        {(p) => (
          <Input
            {...p}
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            autoComplete="off"
            required
          />
        )}
      </Field>
      <EmojiPicker value={emoji} onChange={setEmoji} error={fieldError(state, "emoji")} />
      <ColorPicker value={color} onChange={setColor} error={fieldError(state, "color")} />
      <Switch
        name="hidden"
        defaultChecked={team.hidden}
        label="Hide from scoreboard"
        hint="For test runs: the team still scores, but players and the big screen never see it, and it doesn’t affect solve counts or contest places."
      />
      <FormMessage state={formLevel(state, ["name", "emoji", "color"])} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" pending={pending}>
          {pending ? "Saving" : "Save team"}
        </Button>
        <Button variant="ghost" size="lg" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
