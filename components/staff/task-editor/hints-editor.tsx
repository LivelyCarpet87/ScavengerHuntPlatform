"use client";

import { ArrowDown, ArrowUp, Trash } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { formatPoints } from "@/lib/format";
import { formLevel } from "@/lib/staff/forms";
import { addHintAction, deleteHintAction, moveHintAction, updateHintAction } from "@/lib/staff/task-actions";
import { ConfirmAction } from "../confirm-action";
import { useActionForm } from "../use-action-form";

export type HintData = { id: string; body: string; cost: number; reveals: number };

/** Hints for one task: edit in place, reorder, delete, add. */
export function HintsEditor({ huntId, taskId, hints }: { huntId: string; taskId: string; hints: HintData[] }) {
  return (
    <section id="hints" aria-labelledby="hints-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="hints-heading" className="font-cond text-2xl font-bold">
          Hints
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          Teams reveal hints in this order and pay the cost from their score. Changing a cost doesn’t affect teams who
          already revealed the hint.
        </p>
      </div>
      {hints.length > 0 ? (
        <ol className="divide-y divide-line rounded-lg border border-line">
          {hints.map((hint, i) => (
            <HintRow key={hint.id} huntId={huntId} hint={hint} index={i} total={hints.length} />
          ))}
        </ol>
      ) : null}
      <AddHint huntId={huntId} taskId={taskId} first={hints.length === 0} />
    </section>
  );
}

function HintRow({ huntId, hint, index, total }: { huntId: string; hint: HintData; index: number; total: number }) {
  const { state, pending, onSubmit, formRef } = useActionForm(updateHintAction, {
    onSuccess: (s) => {
      if (s?.ok && s.message) toast({ title: s.message, tone: "success" });
    },
  });
  const [moving, startMove] = useTransition();
  const move = (direction: "up" | "down") =>
    startMove(async () => {
      const result = await moveHintAction({ huntId, hintId: hint.id, direction });
      if (result && !result.ok) toast({ title: "Couldn’t move the hint", description: result.error, tone: "danger" });
    });
  const label = `Hint ${index + 1}`;

  return (
    <li className="flex flex-col gap-3 p-4">
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3">
        <input type="hidden" name="huntId" value={huntId} />
        <input type="hidden" name="hintId" value={hint.id} />
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            {label}
            {hint.reveals > 0 ? (
              <span className="ml-2 font-normal text-ink-2">
                revealed by {hint.reveals} {hint.reveals === 1 ? "team" : "teams"}
              </span>
            ) : null}
          </p>
          <div className="flex gap-0.5">
            <button
              type="button"
              onClick={() => move("up")}
              disabled={index === 0 || moving}
              aria-label={`Move ${label} up`}
              className="grid size-10 place-items-center rounded-md text-ink-2 hover:bg-mist hover:text-ink disabled:opacity-30"
            >
              <ArrowUp className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => move("down")}
              disabled={index === total - 1 || moving}
              aria-label={`Move ${label} down`}
              className="grid size-10 place-items-center rounded-md text-ink-2 hover:bg-mist hover:text-ink disabled:opacity-30"
            >
              <ArrowDown className="size-4" />
            </button>
          </div>
        </div>
        <Textarea
          name="body"
          rows={2}
          defaultValue={hint.body}
          maxLength={500}
          aria-label={`${label} text`}
          aria-invalid={fieldError(state, "body") ? true : undefined}
        />
        {fieldError(state, "body") ? (
          <p className="text-sm font-medium text-danger">{fieldError(state, "body")}</p>
        ) : null}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Cost" error={fieldError(state, "cost")} className="w-28">
            {(p) => (
              <Input {...p} name="cost" inputMode="numeric" defaultValue={hint.cost} className="font-bib text-lg" />
            )}
          </Field>
          <Button type="submit" variant="secondary" pending={pending}>
            Save hint
          </Button>
        </div>
        {state && !state.ok ? <FormMessage state={formLevel(state, ["body", "cost"])} /> : null}
      </form>
      <ConfirmAction
        action={deleteHintAction}
        fields={{ huntId, hintId: hint.id }}
        label={
          <>
            Delete hint<span className="sr-only"> {index + 1}</span>
          </>
        }
        icon={<Trash aria-hidden />}
        variant="ghost"
        size="sm"
        className="self-start text-danger"
        title={`Delete ${label.toLowerCase()}?`}
        description={
          hint.reveals > 0
            ? `${hint.reveals} ${hint.reveals === 1 ? "team has" : "teams have"} revealed it. They get the ${formatPoints(hint.cost)} points they paid back.`
            : "Nobody has revealed it yet."
        }
        confirmLabel="Delete hint"
      />
    </li>
  );
}

function AddHint({ huntId, taskId, first }: { huntId: string; taskId: string; first: boolean }) {
  const { state, pending, onSubmit, formRef } = useActionForm(addHintAction, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg bg-mist p-4">
      <input type="hidden" name="huntId" value={huntId} />
      <input type="hidden" name="taskId" value={taskId} />
      <Field
        label={first ? "First hint" : "Another hint"}
        hint={first ? "Point teams in the right direction without giving it away." : undefined}
        error={fieldError(state, "body")}
      >
        {(p) => (
          <Textarea {...p} name="body" rows={2} maxLength={500} className="bg-paper" placeholder="Look up, not down." />
        )}
      </Field>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Cost" error={fieldError(state, "cost")} className="w-28">
          {(p) => (
            <Input {...p} name="cost" inputMode="numeric" defaultValue={10} className="bg-paper font-bib text-lg" />
          )}
        </Field>
        <Button type="submit" variant="secondary" pending={pending}>
          Add hint
        </Button>
      </div>
      <FormMessage state={formLevel(state, ["body", "cost"])} />
    </form>
  );
}
