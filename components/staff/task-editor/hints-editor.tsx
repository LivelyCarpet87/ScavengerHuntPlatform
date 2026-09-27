"use client";

import { ArrowDown, ArrowUp, Trash } from "lucide-react";
import { useLayoutEffect, useOptimistic, useRef, useState, useTransition } from "react";
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

type Direction = "up" | "down";

const moveButtonId = (hintId: string, direction: Direction) => `hint-${direction}-${hintId}`;

/**
 * Hints for one task: edit in place, reorder, delete, add. Reordering shows
 * straight away, keeps focus on the button you pressed and tells screen
 * readers the new position (like the task list). `readOnly` (archived hunts)
 * lists the hints without any controls.
 */
export function HintsEditor({
  huntId,
  taskId,
  hints,
  readOnly = false,
}: {
  huntId: string;
  taskId: string;
  hints: HintData[];
  readOnly?: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(hints);
  const [, startTransition] = useTransition();
  const [announcement, setAnnouncement] = useState("");

  // Reordering moves DOM nodes, which drops focus; put it back once the new order is on screen.
  const focusAfter = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!focusAfter.current || optimistic.length === 0) return;
    document.getElementById(focusAfter.current)?.focus();
    focusAfter.current = null;
  }, [optimistic]);

  const move = (hintId: string, direction: Direction) => {
    const from = optimistic.findIndex((h) => h.id === hintId);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= optimistic.length) return;
    const next = [...optimistic];
    [next[from], next[to]] = [next[to], next[from]];
    // At the top or bottom the pressed button is switched off: keep focus on the other one.
    const atEdge = to === 0 ? "up" : to === next.length - 1 ? "down" : null;
    focusAfter.current = moveButtonId(hintId, atEdge === direction ? (direction === "up" ? "down" : "up") : direction);
    startTransition(async () => {
      setOptimistic(next);
      const result = await moveHintAction({ huntId, hintId, direction });
      if (result && !result.ok) {
        toast({ title: "Couldn’t move the hint", description: result.error, tone: "danger" });
        return;
      }
      setAnnouncement(`Moved hint ${from + 1} ${direction}. It’s now hint ${to + 1} of ${next.length}.`);
    });
  };

  return (
    <section id="hints" aria-labelledby="hints-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="hints-heading" className="font-cond text-2xl font-bold">
          Hints
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          {readOnly
            ? "Teams reveal hints in this order and pay the cost from their score."
            : "Teams reveal hints in this order and pay the cost from their score. Changing a cost doesn’t affect teams who already revealed the hint."}
        </p>
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {readOnly ? (
        optimistic.length > 0 ? (
          <ol className="divide-y divide-line rounded-lg border border-line">
            {optimistic.map((hint, i) => (
              <li key={hint.id} className="flex flex-col gap-1 p-4">
                <p className="text-sm font-semibold">
                  Hint {i + 1}
                  <span className="ml-2 font-normal text-ink-2">
                    costs {formatPoints(hint.cost)}
                    {hint.reveals > 0 ? `, revealed by ${hint.reveals} ${hint.reveals === 1 ? "team" : "teams"}` : null}
                  </span>
                </p>
                <p className="whitespace-pre-line wrap-anywhere">{hint.body}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-2">This task has no hints.</p>
        )
      ) : (
        <>
          {optimistic.length > 0 ? (
            <ol className="divide-y divide-line rounded-lg border border-line">
              {optimistic.map((hint, i) => (
                <HintRow
                  key={hint.id}
                  huntId={huntId}
                  hint={hint}
                  index={i}
                  total={optimistic.length}
                  onMove={(direction) => move(hint.id, direction)}
                />
              ))}
            </ol>
          ) : null}
          <AddHint huntId={huntId} taskId={taskId} first={optimistic.length === 0} />
        </>
      )}
    </section>
  );
}

function HintRow({
  huntId,
  hint,
  index,
  total,
  onMove,
}: {
  huntId: string;
  hint: HintData;
  index: number;
  total: number;
  onMove: (direction: Direction) => void;
}) {
  const { state, pending, onSubmit, formRef } = useActionForm(updateHintAction, {
    onSuccess: (s) => {
      if (s?.ok && s.message) toast({ title: s.message, tone: "success" });
    },
  });
  const label = `Hint ${index + 1}`;
  const moveButton =
    "grid size-10 place-items-center rounded-md text-ink-2 hover:bg-mist hover:text-ink disabled:opacity-30";

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
            {/* Only the ends switch off: a button pressed mid-move keeps its focus. */}
            <button
              id={moveButtonId(hint.id, "up")}
              type="button"
              onClick={() => onMove("up")}
              disabled={index === 0}
              aria-label={`Move ${label} up`}
              className={moveButton}
            >
              <ArrowUp className="size-4" />
            </button>
            <button
              id={moveButtonId(hint.id, "down")}
              type="button"
              onClick={() => onMove("down")}
              disabled={index === total - 1}
              aria-label={`Move ${label} down`}
              className={moveButton}
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
