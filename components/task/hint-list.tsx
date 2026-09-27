"use client";

import { Lightbulb } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import type { ActionState } from "@/lib/actions";
import { formatSigned, plural } from "@/lib/format";
import { type RevealedHint, revealHint } from "@/lib/player/hints";

export type HintView = {
  id: string;
  /** Position among the task's hints (1-based), kept when the list only shows some of them. */
  number: number;
  cost: number;
  /** Null until the team reveals it — unrevealed text never leaves the server. */
  body: string | null;
};

function costLabel(cost: number): string {
  return cost > 0 ? `(${formatSigned(-cost)})` : "(free)";
}

/**
 * The task's hints in order. Revealed ones show their text; the others offer
 * "Reveal hint (−10)" behind a confirmation that spells out the cost.
 */
export function HintList({
  hints,
  canReveal,
  staffView = false,
}: {
  hints: HintView[];
  /** False when the task is closed or done, or for staff previews. */
  canReveal: boolean;
  /** Staff see every hint's text and what it costs teams. */
  staffView?: boolean;
}) {
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<HintView | null>(null);

  return (
    <>
      <ol className="flex flex-col divide-y divide-line rounded-lg border border-line">
        {hints.map((hint) => {
          const body = hint.body ?? revealed[hint.id] ?? null;
          return (
            <li key={hint.id} className="flex flex-col gap-2 px-4 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <p className="flex items-center gap-2 font-semibold">
                  <Lightbulb aria-hidden className={body ? "size-4 text-water" : "size-4 text-ink-3"} />
                  Hint {hint.number}
                  {body || staffView ? (
                    <span className="text-sm font-medium text-ink-2">
                      {hint.cost > 0
                        ? staffView
                          ? `costs teams ${plural(hint.cost, "point")}`
                          : `${formatSigned(-hint.cost)} points`
                        : "free"}
                    </span>
                  ) : null}
                </p>
                {!body && canReveal ? (
                  hint.cost > 0 ? (
                    <Button variant="quiet" onClick={() => setConfirming(hint)}>
                      Reveal hint {costLabel(hint.cost)}
                    </Button>
                  ) : (
                    <RevealForm
                      hint={hint}
                      label="Reveal hint (free)"
                      onRevealed={(text) => setRevealed((r) => ({ ...r, [hint.id]: text }))}
                    />
                  )
                ) : null}
                {!body && !canReveal ? <span className="text-sm text-ink-3">Not revealed</span> : null}
              </div>
              {body ? <p className="leading-relaxed text-pretty">{body}</p> : null}
            </li>
          );
        })}
      </ol>
      <Dialog
        open={confirming != null}
        onClose={() => setConfirming(null)}
        title={confirming ? `Reveal hint ${confirming.number}?` : "Reveal hint?"}
        description={
          confirming
            ? `This costs your team ${plural(confirming.cost, "point")}, whether or not you solve the task.`
            : undefined
        }
      >
        {confirming ? (
          <RevealForm
            key={confirming.id}
            hint={confirming}
            label={`Reveal hint ${costLabel(confirming.cost)}`}
            onRevealed={(text) => {
              setRevealed((r) => ({ ...r, [confirming.id]: text }));
              setConfirming(null);
            }}
            onCancel={() => setConfirming(null)}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function RevealForm({
  hint,
  label,
  onRevealed,
  onCancel,
}: {
  hint: HintView;
  label: string;
  onRevealed: (body: string) => void;
  onCancel?: () => void;
}) {
  const [state, action] = useActionState<ActionState<RevealedHint>, FormData>(async (prev, formData) => {
    const result = await revealHint(prev, formData);
    if (result?.ok && result.data) onRevealed(result.data.body);
    return result;
  }, null);

  return (
    <form action={action} className={onCancel ? "flex flex-col gap-3 pt-1" : undefined}>
      <input type="hidden" name="hintId" value={hint.id} />
      {state && !state.ok ? <FormMessage state={state} className={onCancel ? undefined : "mb-2"} /> : null}
      <div className={onCancel ? "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end" : undefined}>
        {onCancel ? (
          <Button variant="ghost" size="lg" onClick={onCancel}>
            Keep it hidden
          </Button>
        ) : null}
        <SubmitButton variant={onCancel ? "primary" : "quiet"} size={onCancel ? "lg" : "md"} pendingLabel="Revealing">
          {label}
        </SubmitButton>
      </div>
    </form>
  );
}
