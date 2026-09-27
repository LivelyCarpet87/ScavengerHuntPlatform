"use client";

import { type FormEvent, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { plural } from "@/lib/format";
import type { SubmissionReply } from "./send";
import type { ActionTask } from "./task-types";
import { useSubmitter } from "./use-submitter";

/** One text field and "Check answer" — auto-checked answers reply instantly. */
export function AnswerForm({
  huntId,
  task,
  wrongAttempts,
  onDone,
  onQueued,
}: {
  huntId: string;
  task: ActionTask;
  wrongAttempts: number;
  onDone: (reply: SubmissionReply) => void;
  onQueued: () => void;
}) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const { submit, busy } = useSubmitter(huntId, task.id);

  const max = task.maxAttempts;
  const left = max != null ? Math.max(0, max - wrongAttempts) : null;
  // The result line under the field already counts what's left, so the standing hint steps aside for it.
  const attemptsHint =
    max == null || left == null || message
      ? undefined
      : left === max
        ? `Your team has ${plural(max, "attempt")}.`
        : `${plural(left, "attempt")} left out of ${max}.`;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
                ? "Not quite, and that was your team's last attempt."
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
        break;
      case "cancelled":
        break;
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      {/* The section heading ("Your answer") labels the field visually. */}
      <label htmlFor={id} className="sr-only">
        Your answer
      </label>
      {attemptsHint ? (
        <p id={`${id}-hint`} className="-mt-1 text-sm text-ink-2">
          {attemptsHint}
        </p>
      ) : null}
      <Input
        id={id}
        ref={inputRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (message) setMessage(null);
        }}
        aria-invalid={message ? true : undefined}
        aria-describedby={
          [attemptsHint ? `${id}-hint` : null, message ? `${id}-error` : null].filter(Boolean).join(" ") || undefined
        }
        maxLength={500}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="send"
        disabled={busy}
        className="h-14 text-lg"
      />
      {message ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger">
          {message}
        </p>
      ) : null}
      <Button type="submit" size="lg" pending={busy} className="w-full sm:w-auto sm:self-start">
        {task.autoChecked ? "Check answer" : "Send answer"}
      </Button>
    </form>
  );
}
