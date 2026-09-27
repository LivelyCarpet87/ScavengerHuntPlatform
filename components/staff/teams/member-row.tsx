"use client";

import { ArrowRightLeft, Crown, Pencil, UserMinus } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/countdown";
import { Input, Select } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { makeCaptainAction, movePlayerAction, removePlayerAction, renamePlayerAction } from "@/lib/staff/team-actions";
import { ActionButton } from "../action-button";
import { ConfirmAction } from "../confirm-action";
import { useActionForm } from "../use-action-form";

export type MemberData = {
  id: string;
  name: string;
  isCaptain: boolean;
  signedIn: boolean;
  lastSeenAt: number;
};

/** One member of a team: rename in place, make captain, move to another team, remove. */
export function MemberRow({
  huntId,
  member,
  otherTeams,
  editable,
  serverNow,
}: {
  huntId: string;
  member: MemberData;
  otherTeams: { id: string; name: string }[];
  editable: boolean;
  serverNow: number;
}) {
  const ids = useId();
  const [renaming, setRenaming] = useState(false);
  const [moving, setMoving] = useState(false);
  const rename = useActionForm(renamePlayerAction, { onSuccess: () => setRenaming(false) });
  const move = useActionForm(movePlayerAction, {
    onSuccess: (s) => {
      setMoving(false);
      if (s?.ok && s.message) toast({ title: s.message, tone: "success" });
    },
  });

  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {renaming ? (
          <form
            ref={rename.formRef}
            onSubmit={rename.onSubmit}
            className="flex min-w-0 flex-1 basis-64 flex-wrap items-center gap-2"
          >
            <input type="hidden" name="huntId" value={huntId} />
            <input type="hidden" name="playerId" value={member.id} />
            <label htmlFor={`${ids}-name`} className="sr-only">
              New name for {member.name}
            </label>
            <Input
              id={`${ids}-name`}
              name="name"
              defaultValue={member.name}
              maxLength={24}
              autoFocus
              aria-invalid={fieldError(rename.state, "name") ? true : undefined}
              className="h-11 min-w-0 flex-1 basis-40"
            />
            <Button type="submit" size="sm" variant="secondary" pending={rename.pending} className="h-11">
              Save name
            </Button>
            <Button size="sm" variant="ghost" className="h-11" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            {rename.state && !rename.state.ok ? <FormMessage state={rename.state} className="basis-full" /> : null}
          </form>
        ) : (
          <div className="min-w-0 flex-1 basis-48">
            <p className="flex items-center gap-2 font-semibold">
              <span className="truncate">{member.name}</span>
              {member.isCaptain ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-mist-2 px-2 py-0.5 text-xs font-semibold text-ink">
                  <Crown aria-hidden className="size-3" /> Captain
                </span>
              ) : null}
            </p>
            <p className="text-sm text-ink-2">
              {member.signedIn ? "Signed in, " : "Signed out, "}last seen{" "}
              <RelativeTime at={member.lastSeenAt} serverNow={serverNow} />
            </p>
          </div>
        )}
        {editable && !renaming ? (
          <div className="flex flex-wrap items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setRenaming(true)} aria-label={`Rename ${member.name}`}>
              <Pencil aria-hidden />
              Rename
            </Button>
            {otherTeams.length > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMoving((m) => !m)}
                aria-expanded={moving}
                aria-label={`Move ${member.name} to another team`}
              >
                <ArrowRightLeft aria-hidden />
                Move
              </Button>
            ) : null}
            {!member.isCaptain ? (
              <ActionButton
                action={makeCaptainAction}
                fields={{ huntId, playerId: member.id }}
                variant="ghost"
                size="sm"
              >
                <Crown aria-hidden />
                Make captain
                <span className="sr-only"> {member.name}</span>
              </ActionButton>
            ) : null}
            <ConfirmAction
              action={removePlayerAction}
              fields={{ huntId, playerId: member.id }}
              label={
                <>
                  Remove<span className="sr-only"> {member.name}</span>
                </>
              }
              icon={<UserMinus aria-hidden />}
              variant="ghost"
              size="sm"
              className="text-danger"
              title={`Remove ${member.name} from the team?`}
              description="Their device leaves the hunt. Submissions they sent stay with the team. They can rejoin with the team code, unless you generate a new one."
              confirmLabel="Remove player"
            />
          </div>
        ) : null}
      </div>
      {editable && moving && otherTeams.length > 0 && !renaming ? (
        <form ref={move.formRef} onSubmit={move.onSubmit} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="huntId" value={huntId} />
          <input type="hidden" name="playerId" value={member.id} />
          <label htmlFor={`${ids}-move`} className="text-sm text-ink-2">
            Move to
          </label>
          <div className="min-w-0 flex-1 basis-40 sm:max-w-60">
            <Select id={`${ids}-move`} name="toTeamId" defaultValue="" className="h-10 text-sm" required>
              <option value="" disabled>
                Choose a team
              </option>
              {otherTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" size="sm" variant="secondary" pending={move.pending} className="h-10">
            Move {member.name.split(" ")[0]}
          </Button>
          <Button size="sm" variant="ghost" className="h-10" onClick={() => setMoving(false)}>
            Cancel
          </Button>
          {move.state && !move.state.ok ? <FormMessage state={move.state} className="basis-full" /> : null}
        </form>
      ) : null}
    </li>
  );
}
