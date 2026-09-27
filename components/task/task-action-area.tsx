"use client";

import { CircleCheck, CloudUpload, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { PunchCelebration } from "@/components/live/punch-celebration";
import { Numeral } from "@/components/ui/bib";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { formatSigned, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AnswerForm } from "./answer-form";
import { CheckpointForm } from "./checkpoint-form";
import { MediaForm } from "./media-form";
import { QueuedUploadList, SendNowButton, useQueuedUploads } from "./queued-uploads";
import type { SubmissionReply } from "./send";
import type { ActionTask, TeamTaskState } from "./task-types";

export type TaskActionAreaProps = {
  huntId: string;
  slug: string;
  task: ActionTask;
  /** The team's standing on this task, from the server. */
  state: TeamTaskState;
  /** Why nobody can submit right now (hunt over, task closed…), or null when open. */
  closedReason: string | null;
  /** What to do instead, shown under the reason (e.g. a link to the results). */
  closedNote?: ReactNode;
  /** The hunt has ended (results are final). */
  huntOver?: boolean;
  wrongAttempts: number;
  /** "19:42" — when the team's accepted submission was made, in the hunt's time zone. */
  punchedAt: string | null;
  /** <input accept> for media and contest entries. */
  accept: string;
  maxUploadBytes: number;
  /** The newest submission while it waits for a judge, rendered on the server. */
  latest?: ReactNode;
  /** Contest: the team's entries still waiting for a judge. */
  pendingEntries?: number;
};

type Punched = { headline: string; points: number | null; key: string };

/**
 * Everything a team does on a task page: the form for the task's kind, the
 * waiting and done states, and uploads saved on this phone. An instant
 * acceptance (right answer, checkpoint code, auto-accepted photo) plays the
 * shared PunchCelebration once, then settles into the done state.
 */
export function TaskActionArea(props: TaskActionAreaProps) {
  const { huntId, slug, task, state, closedReason, wrongAttempts, punchedAt, latest } = props;
  const router = useRouter();
  const [punched, setPunched] = useState<Punched | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [lastState, setLastState] = useState(state);
  const queued = useQueuedUploads(huntId, task.id);
  const contest = task.kind === "contest";

  // Once the server reports a new state (our submission arrived, or a judge decided), it takes over.
  if (lastState !== state) {
    setLastState(state);
    setJustSent(false);
    // A judge can still overturn an instant acceptance.
    if (lastState === "approved") setPunched(null);
  }

  function handleDone(reply: SubmissionReply) {
    const { status, points, id } = reply.submission;
    if (status === "approved" && !contest) {
      const headline = task.kind === "answer" ? "Correct!" : task.kind === "checkpoint" ? "Punched!" : "Accepted!";
      setPunched({ headline, points, key: id });
      setCelebrating(true);
    } else if (status === "pending" && !contest) {
      setJustSent(true);
    }
    router.refresh();
  }

  const celebration =
    celebrating && punched ? (
      <PunchCelebration
        key={punched.key}
        code={task.code}
        title={task.title}
        points={punched.points}
        seed={task.id}
        onDone={() => setCelebrating(false)}
      />
    ) : null;

  const waiting = queued.filter((item) => item.state !== "failed");
  const failed = queued.filter((item) => item.state === "failed");

  if (!contest && (state === "approved" || punched)) {
    return (
      <>
        {celebration}
        <div className="flex items-start gap-3 rounded-lg bg-forest-wash px-4 py-4">
          <CircleCheck aria-hidden className="mt-1 size-6 shrink-0 text-forest" />
          <div className="min-w-0">
            <p className="font-cond text-2xl font-extrabold tracking-tight">
              {punchedAt ? `Done — punched at ${punchedAt}` : "Done — punched"}
            </p>
            {punched ? (
              <output className="mt-1 flex flex-wrap items-baseline gap-x-2 text-ink">
                <span className="font-semibold">{punched.headline}</span>
                {punched.points ? (
                  <span>
                    <Numeral className="text-2xl text-forest">{formatSigned(punched.points)}</Numeral> points
                  </span>
                ) : null}
              </output>
            ) : (
              <p className="mt-1 text-ink-2">
                {props.huntOver
                  ? "The hunt is over. See where your team finished."
                  : "Nothing more to send here. On to the next control."}
              </p>
            )}
            <ButtonLink
              href={props.huntOver ? `/h/${slug}/scoreboard` : `/h/${slug}`}
              variant="secondary"
              className="mt-3"
            >
              {props.huntOver ? "See the final scoreboard" : "Back to tasks"}
            </ButtonLink>
          </div>
        </div>
      </>
    );
  }

  const block = (title: ReactNode, body: ReactNode, icon: ReactNode, tone: "sun" | "danger" | "mist" = "mist") => (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg px-4 py-3.5",
        tone === "sun" && "bg-sun-wash",
        tone === "danger" && "bg-danger-wash",
        tone === "mist" && "bg-mist",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="font-semibold text-ink">{title}</p>
        {body ? <div className="mt-0.5 text-sm text-ink-2">{body}</div> : null}
      </div>
    </div>
  );

  if (closedReason) {
    return (
      <div className="flex flex-col gap-4">
        {block(
          closedReason,
          state === "pending" ? "Your last submission is still with the judges." : props.closedNote,
          <Lock aria-hidden className="size-5 text-ink-2" />,
        )}
        {state === "pending" && latest ? latest : null}
      </div>
    );
  }

  if (!contest && (state === "pending" || justSent)) {
    return (
      <div className="flex flex-col gap-4">
        {block(
          task.kind === "answer" ? "Sent to the judges" : "Waiting for a judge",
          task.kind === "answer"
            ? "If they don't accept it, you can answer again."
            : "If they don't accept it, you can send new proof.",
          <PendingGlyph />,
          "sun",
        )}
        {state === "pending" ? latest : null}
      </div>
    );
  }

  const outOfAttempts = task.kind === "answer" && task.maxAttempts != null && wrongAttempts >= task.maxAttempts;
  if (outOfAttempts) {
    return (
      <div className="flex flex-col gap-4">
        {block(
          "This task is locked for your team",
          `You've used all ${plural(task.maxAttempts ?? 0, "attempt")}. The other tasks are still open.`,
          <Lock aria-hidden className="size-5 text-danger" />,
          "danger",
        )}
        {latest}
      </div>
    );
  }

  const savedOnPhone =
    waiting.length > 0 ? (
      <div className="flex flex-col gap-3 rounded-lg border-2 border-dashed border-line-strong px-4 py-4">
        <div className="flex items-start gap-3">
          <CloudUpload aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Saved on this phone</p>
            <p className="text-sm text-ink-2">It'll send by itself when you're back online.</p>
          </div>
          <SendNowButton className="-my-1 shrink-0" />
        </div>
        <QueuedUploadList items={waiting} />
      </div>
    ) : null;

  // One submission at a time for standard tasks: wait for the saved one to go out.
  if (!contest && savedOnPhone) return savedOnPhone;

  const form =
    task.kind === "answer" ? (
      <AnswerForm
        huntId={huntId}
        task={task}
        wrongAttempts={wrongAttempts}
        onDone={handleDone}
        onQueued={() => router.refresh()}
      />
    ) : task.kind === "checkpoint" ? (
      <CheckpointForm huntId={huntId} slug={slug} task={task} onDone={handleDone} onQueued={() => router.refresh()} />
    ) : (
      <MediaForm
        huntId={huntId}
        task={task}
        accept={props.accept}
        maxUploadBytes={props.maxUploadBytes}
        onDone={handleDone}
        onQueued={() => router.refresh()}
      />
    );

  return (
    <div className="flex flex-col gap-5">
      {contest && (props.pendingEntries ?? 0) > 0 ? (
        <Notice tone="warning" icon={<PendingGlyph />}>
          {props.pendingEntries === 1
            ? "1 entry is waiting for a judge. You can still send more."
            : `${props.pendingEntries} entries are waiting for a judge. You can still send more.`}
        </Notice>
      ) : null}
      {savedOnPhone}
      {failed.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg bg-danger-wash px-4 py-4">
          <p className="font-semibold">Couldn't send from this phone</p>
          <QueuedUploadList items={failed} />
        </div>
      ) : null}
      {form}
    </div>
  );
}

function PendingGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="size-5 text-sun-fg">
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeDasharray="4 3" />
    </svg>
  );
}
