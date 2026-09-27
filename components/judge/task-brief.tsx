"use client";

import Link from "next/link";
import { memo, type ReactNode, useState } from "react";
import { ControlMarker } from "@/components/ui/control";
import { StatusGlyph } from "@/components/ui/status";
import { matchAnswer } from "@/lib/judging/answers";
import type { JudgeTask } from "@/lib/judging/types";
import { cn } from "@/lib/utils";

/** What the task asks for and how it scores — the judge's rulebook for one submission. */
export const TaskBrief = memo(function TaskBrief({
  task,
  description,
  answerText,
  descriptionOpen,
  onDescriptionToggle,
  taskHref,
  hideHeader,
  headerClassName,
  className,
}: {
  task: JudgeTask;
  /**
   * The task's description, rendered on the server (<Markdown>) so the
   * Markdown parser never ships to judges' phones. Null when there is none.
   */
  description: ReactNode;
  /** The team's typed answer, to check against the accepted answers. */
  answerText?: string | null;
  /** Controlled open state for the description (the queue keeps it across submissions). */
  descriptionOpen?: boolean;
  onDescriptionToggle?: (open: boolean) => void;
  /** Link to the task in the organizer's task editor (omitted for judges). */
  taskHref?: string | null;
  /** Leave out the marker and title when the page already shows them. */
  hideHeader?: boolean;
  /** Extra classes for the marker-and-title row, e.g. to show it only on wide screens. */
  headerClassName?: string;
  className?: string;
}) {
  const [ownOpen, setOwnOpen] = useState(true);
  const open = descriptionOpen ?? ownOpen;
  const toggle = onDescriptionToggle ?? setOwnOpen;
  const matches =
    task.kind === "answer" && task.answers.length > 0 && answerText
      ? matchAnswer(answerText, task.answers, task.answerMatch)
      : null;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className={cn("flex items-start gap-3", headerClassName, hideHeader && "hidden")}>
        <ControlMarker code={task.code} state="pending" size="md" label={`Control ${task.code}`} />
        <div className="min-w-0 flex-1">
          <h2 className="font-cond text-2xl leading-tight font-extrabold tracking-tight">
            {taskHref ? (
              <Link href={taskHref} className="hover:underline hover:decoration-2 hover:underline-offset-4">
                {task.title}
              </Link>
            ) : (
              task.title
            )}
          </h2>
          <p className="mt-1 flex flex-wrap gap-1.5 text-xs font-semibold text-ink-2">
            <span className="rounded-full bg-mist px-2 py-0.5">{task.kindLabel}</span>
            {task.hidden ? <span className="rounded-full bg-mist px-2 py-0.5">Hidden from players</span> : null}
          </p>
        </div>
      </div>

      {description ? (
        <details
          open={open}
          onToggle={(e) => toggle(e.currentTarget.open)}
          className="group rounded-lg bg-mist px-4 py-3"
        >
          <summary className="-mx-1 flex cursor-pointer list-none items-center gap-2 rounded-sm px-1 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="size-3.5 shrink-0 text-ink-2 transition-transform group-open:rotate-90"
            >
              <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            What the task asks
          </summary>
          <div className="mt-2 text-[0.9375rem]">{description}</div>
        </details>
      ) : null}

      {task.kind === "answer" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Accepted answers</p>
          {task.answers.length > 0 ? (
            <>
              <ul className="flex flex-wrap gap-1.5">
                {task.answers.map((a) => (
                  <li key={a} className="rounded-sm bg-forest-wash px-2 py-1 text-sm font-medium text-forest">
                    {a}
                  </li>
                ))}
              </ul>
              {matches != null ? (
                <p
                  className={cn(
                    "flex items-center gap-1.5 text-sm font-medium",
                    matches ? "text-forest" : "text-ink-2",
                  )}
                >
                  <StatusGlyph status={matches ? "approved" : "rejected"} />
                  {matches
                    ? "Their answer matches one of these."
                    : `Their answer doesn’t match${task.answerMatch === "loose" ? ", even ignoring case and punctuation" : ""}.`}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-ink-2">None set, so judges check every answer by hand.</p>
          )}
        </div>
      ) : null}

      <p className="text-sm text-ink-2">{task.scoringText}</p>
    </div>
  );
});
