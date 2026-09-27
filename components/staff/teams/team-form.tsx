"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form";
import { TeamAvatar } from "@/components/ui/team-badge";
import { TEAM_COLOR_KEYS, TEAM_COLORS, TEAM_EMOJI, teamColorHex } from "@/lib/palette";
import { formLevel } from "@/lib/staff/forms";
import { updateTeamAction } from "@/lib/staff/team-actions";
import { cn } from "@/lib/utils";
import { useActionForm } from "../use-action-form";

/** Name, emoji, color and visibility of a team, with a live avatar preview. */
export function TeamForm({
  huntId,
  team,
}: {
  huntId: string;
  team: { id: string; name: string; emoji: string; color: string; hidden: boolean };
}) {
  const ids = useId();
  const [name, setName] = useState(team.name);
  const [emoji, setEmoji] = useState(team.emoji);
  const [color, setColor] = useState(team.color);
  const { state, pending, onSubmit, formRef } = useActionForm(updateTeamAction);
  const emojiChoices = TEAM_EMOJI.includes(team.emoji) ? TEAM_EMOJI : [team.emoji, ...TEAM_EMOJI];

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-5">
      <input type="hidden" name="huntId" value={huntId} />
      <input type="hidden" name="teamId" value={team.id} />
      <div className="flex items-center gap-4">
        <TeamAvatar team={{ name, emoji, color }} size="lg" />
        <Field label="Team name" error={fieldError(state, "name")} className="flex-1">
          {(p) => (
            <Input {...p} name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} required />
          )}
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold">Emoji</legend>
        <div className="mt-2 grid grid-cols-6 gap-1.5 sm:grid-cols-10 lg:grid-cols-6">
          {emojiChoices.map((e) => (
            <label
              key={e}
              htmlFor={`${ids}-e-${e}`}
              className="grid aspect-square cursor-pointer place-items-center rounded-md text-2xl hover:bg-mist has-checked:bg-accent-wash has-checked:shadow-[inset_0_0_0_2px_var(--accent)] has-focus-visible:outline-3 has-focus-visible:outline-overprint"
            >
              <input
                id={`${ids}-e-${e}`}
                type="radio"
                name="emoji"
                value={e}
                checked={emoji === e}
                onChange={() => setEmoji(e)}
                className="sr-only"
              />
              {e}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold">Color</legend>
        <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-4">
          {TEAM_COLOR_KEYS.map((key) => (
            <label
              key={key}
              htmlFor={`${ids}-c-${key}`}
              className={cn(
                "flex h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm font-medium text-ink-2 hover:bg-mist",
                "has-checked:bg-paper has-checked:font-semibold has-checked:text-ink has-checked:shadow-[inset_0_0_0_2px_var(--ink)] has-focus-visible:outline-3 has-focus-visible:outline-overprint",
              )}
            >
              <input
                id={`${ids}-c-${key}`}
                type="radio"
                name="color"
                value={key}
                checked={color === key}
                onChange={() => setColor(key)}
                className="sr-only"
              />
              <span aria-hidden className="size-5 shrink-0 rounded-full" style={{ background: teamColorHex(key) }} />
              <span className="truncate">{TEAM_COLORS[key].label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Switch
        name="hidden"
        defaultChecked={team.hidden}
        label="Hide from scoreboard"
        hint="For test runs: the team still scores, but players and the big screen never see it, and it doesn’t affect solve counts or contest places."
      />

      <FormMessage state={formLevel(state, ["name"])} />
      <Button type="submit" variant="secondary" pending={pending} className="self-start">
        Save team
      </Button>
    </form>
  );
}
