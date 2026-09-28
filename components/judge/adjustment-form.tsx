"use client";

import { Minus, Plus, Trash } from "lucide-react";
import { type FormEvent, startTransition, useActionState, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { FormMessage, fieldError, SubmitButton } from "@/components/ui/form";
import { formatPoints, formatSigned } from "@/lib/format";
import { createAdjustment, deleteAdjustment } from "@/lib/judging/actions";
import { cn } from "@/lib/utils";

type TeamOption = { id: string; name: string; hidden: boolean; total: number };

/**
 * "Adjust a score": a bonus or a penalty with a reason. The sign is chosen
 * explicitly (never typed), shown on the field, in the preview and on the
 * button, so a penalty can't be entered as a bonus by accident.
 */
export function AdjustmentForm({
  huntId,
  teams,
  defaultTeamId,
}: {
  huntId: string;
  teams: TeamOption[];
  defaultTeamId: string | null;
}) {
  const id = useId();
  const [state, submit, pending] = useActionState(createAdjustment, null);
  const [direction, setDirection] = useState<"bonus" | "penalty">("bonus");
  const [teamId, setTeamId] = useState(defaultTeamId ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  // Submitted through a transition rather than the form's `action` prop: React
  // resets a form after an action, which would put the team select and the
  // bonus/penalty choice back to their defaults on screen while this state
  // still holds the organizer's choice, so a retry could send a penalty as a bonus.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => submit(data));
  };

  // Start fresh after each successful adjustment.
  useEffect(() => {
    if (state?.ok) {
      setAmount("");
      setReason("");
      setDirection("bonus");
    }
  }, [state]);

  useEffect(() => {
    if (defaultTeamId) setTeamId(defaultTeamId);
  }, [defaultTeamId]);

  // Field problems are shown next to their fields; only repeat what isn't already there.
  const formLevel = state && !state.ok && Object.values(state.fieldErrors ?? {}).includes(state.error) ? null : state;
  const team = teams.find((t) => t.id === teamId);
  const n = /^\d+$/.test(amount.trim()) ? Number(amount.trim()) : null;
  const points = n != null && n > 0 ? (direction === "bonus" ? n : -n) : null;
  const penalty = direction === "penalty";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" id="adjust-form">
      <input type="hidden" name="huntId" value={huntId} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-team`} className="text-sm font-semibold">
          Team
        </label>
        <Select
          id={`${id}-team`}
          name="teamId"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          aria-invalid={fieldError(state, "teamId") ? true : undefined}
        >
          <option value="">Choose a team</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.hidden ? " (hidden)" : ""}
            </option>
          ))}
        </Select>
        {fieldError(state, "teamId") ? (
          <p className="text-sm font-medium text-danger">{fieldError(state, "teamId")}</p>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-semibold">Bonus or penalty</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["bonus", "penalty"] as const).map((d) => (
            <label
              key={d}
              className={cn(
                "flex h-12 cursor-pointer items-center justify-center gap-2 rounded-md bg-mist font-semibold text-ink-2 transition-colors hover:bg-mist-2",
                "has-checked:text-ink has-checked:shadow-[inset_0_0_0_2px_var(--ink)] has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-overprint",
                d === "bonus" ? "has-checked:bg-forest-wash" : "has-checked:bg-danger-wash",
              )}
            >
              <input
                type="radio"
                name="direction"
                value={d}
                checked={direction === d}
                onChange={() => setDirection(d)}
                className="sr-only"
              />
              {d === "bonus" ? (
                <Plus className="size-4 text-forest" aria-hidden />
              ) : (
                <Minus className="size-4 text-danger" aria-hidden />
              )}
              {d === "bonus" ? "Bonus" : "Penalty"}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-amount`} className="text-sm font-semibold">
          Points
        </label>
        <div className="relative w-40">
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-bib text-2xl",
              penalty ? "text-danger" : "text-forest",
            )}
          >
            {penalty ? "−" : "+"}
          </span>
          <Input
            id={`${id}-amount`}
            name="amount"
            inputMode="numeric"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            aria-invalid={fieldError(state, "amount") ? true : undefined}
            aria-describedby={`${id}-preview`}
            className="pl-9 font-bib text-xl"
          />
        </div>
        {fieldError(state, "amount") ? (
          <p className="text-sm font-medium text-danger">{fieldError(state, "amount")}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-reason`} className="text-sm font-semibold">
          Reason
        </label>
        <p id={`${id}-reason-hint`} className="-mt-1 text-sm text-ink-2">
          The team sees it in their notification. It’s logged with your name.
        </p>
        <Input
          id={`${id}-reason`}
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          placeholder={penalty ? "Ran through the library" : "Helped another team find a lost phone"}
          aria-invalid={fieldError(state, "reason") ? true : undefined}
          aria-describedby={`${id}-reason-hint`}
        />
        {fieldError(state, "reason") ? (
          <p className="text-sm font-medium text-danger">{fieldError(state, "reason")}</p>
        ) : null}
      </div>

      <p id={`${id}-preview`} className="min-h-6 text-sm text-ink-2" aria-live="polite">
        {team && points != null ? (
          <>
            {team.name}: <span className="font-bib text-base text-ink">{formatPoints(team.total)}</span> to{" "}
            <span className="font-bib text-base text-ink">{formatPoints(team.total + points)}</span>
          </>
        ) : null}
      </p>

      <div className="flex flex-col gap-3">
        <Button type="submit" variant={penalty ? "danger" : "primary"} size="lg" pending={pending}>
          {pending ? "Saving" : penalty ? "Add penalty" : "Add bonus"}
          {points != null && !pending ? <span className="font-bib text-lg">{formatSigned(points)}</span> : null}
        </Button>
        <FormMessage state={formLevel} />
      </div>
    </form>
  );
}

/** Small "Remove" button with a confirmation sheet. */
export function RemoveAdjustment({
  huntId,
  adjustmentId,
  teamName,
  points,
  reason,
}: {
  huntId: string;
  adjustmentId: string;
  teamName: string;
  points: number;
  reason: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(deleteAdjustment, null);
  const kind = points > 0 ? "bonus" : "penalty";

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label={`Remove the ${formatSigned(points)} ${kind} for ${teamName}`}
        title={`Remove this ${kind}`}
      >
        <Trash aria-hidden />
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Remove this ${kind}?`}
        description={`${teamName}: ${formatSigned(points)} for “${reason}”`}
      >
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="huntId" value={huntId} />
          <input type="hidden" name="adjustmentId" value={adjustmentId} />
          <p className="text-ink-2">
            Their score changes by {formatSigned(-points)} right away. The removal is logged.
          </p>
          <FormMessage state={state} />
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="danger" size="lg" pendingLabel="Removing">
              Remove {kind}
            </SubmitButton>
            <Button variant="quiet" size="lg" onClick={() => setOpen(false)}>
              Keep it
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
