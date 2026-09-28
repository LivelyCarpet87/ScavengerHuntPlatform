"use client";

import { type FormEvent, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { plural } from "@/lib/format";
import { ActionBar } from "./action-bar";
import type { SubmissionReply } from "./send";
import type { ActionTask } from "./task-types";
import { useSubmitter } from "./use-submitter";

/**
 * One text field and "Check answer" — auto-checked answers reply instantly.
 * On phones the field sits in the pinned action bar, like the camera button
 * on photo tasks, so it's reachable however long the riddle is. The field
 * keeps focus while the answer is checked, and a wrong answer is announced
 * and selected for the next try.
 */
export function AnswerForm({
  huntId,
  teamId,
  task,
  wrongAttempts,
  onDone,
  onQueued,
}: {
  huntId: string;
  teamId: string;
  task: ActionTask;
  wrongAttempts: number;
  onDone: (reply: SubmissionReply) => void;
  onQueued: () => void;
}) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const { submit, busy } = useSubmitter(huntId, task.id, teamId);

  const max = task.maxAttempts;
  const left = max != null ? Math.max(0, max - wrongAttempts) : null;
  const hint =
    max != null && left != null
      ? left === max
        ? `Your team has ${plural(max, "attempt")}.`
        : `${plural(left, "attempt")} left out of ${max}.`
      : task.autoChecked
        ? "Wrong answers cost no points."
        : "If the judge doesn’t accept it, you can answer again.";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const answer = value.trim();
    if (!answer) {
      setMessage("Type your answer first.");
      inputRef.current?.focus();
      return;
    }
    setMessage(null);
    const outcome = await submit({ text: answer, label: `Answer for ${task.title}`, queueWhenBusy: false });
    switch (outcome.kind) {
      case "done": {
        const { submission, attemptsLeft } = outcome.reply;
        if (submission.status === "rejected") {
          setMessage(
            attemptsLeft == null
              ? "Not quite. Try again."
              : attemptsLeft === 0
                ? "Not quite, and that was your team’s last attempt."
                : `Not quite. ${plural(attemptsLeft, "attempt")} left.`,
          );
          requestAnimationFrame(() => inputRef.current?.select());
        } else if (submission.status === "pending") {
          setValue("");
          toast({
            title: "Answer sent",
            description: "Sent to the judges. The result shows up here.",
            tone: "success",
          });
        }
        onDone(outcome.reply);
        break;
      }
      case "queued":
        setValue("");
        onQueued();
        break;
      case "refused":
        setMessage(outcome.error);
        requestAnimationFrame(() => inputRef.current?.focus());
        break;
      case "cancelled":
        break;
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <p id={`${id}-hint`} className="text-ink-2">
        {hint}
      </p>
      <ActionBar>
        {/* The section heading ("Your answer") labels the field visually. */}
        <label htmlFor={id} className="sr-only">
          Your answer
        </label>
        {message ? (
          <p id={`${id}-error`} role="alert" className="mb-2 text-sm font-medium text-danger">
            {message}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Input
            id={id}
            ref={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (message) setMessage(null);
            }}
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? `${id}-error ${id}-hint` : `${id}-hint`}
            // Stays focusable (unlike disabled) while the answer is checked, so focus isn't lost.
            readOnly={busy}
            aria-busy={busy || undefined}
            placeholder="Type your answer"
            maxLength={500}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            className="h-14 min-w-0 flex-1 text-lg"
          />
          <Button type="submit" size="lg" pending={busy} className="px-5">
            {task.autoChecked ? "Check answer" : "Send answer"}
          </Button>
        </div>
      </ActionBar>
    </form>
  );
}
