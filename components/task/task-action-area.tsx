"use client";

import { CircleCheck, CloudUpload, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, type Ref, useEffect, useRef, useState } from "react";
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
  /** The player's team: what this phone sends is only ever counted for it. */
  teamId: string;
  task: ActionTask;
  /** The team's standing on this task, from the server. */
  state: TeamTaskState;
  /** Why nobody can submit right now (hunt over, task closed…), or null when open. */
  closedReason: string | null;
  /** What to do instead, shown under the reason (e.g. a link to the results). */
  closedNote?: ReactNode;
  /** The hunt has ended (results are final). */
  huntOver?: boolean;
  /**
   * When submissions close (the task's closing time or the hunt's end, whichever
   * is first), in ms; how to say it, e.g. "The hunt ends at 22:00"; and until
   * when an upload saved before then is still accepted ("22:10"). Uploads
   * waiting on this phone near then get a nudge to find signal.
   */
  closes?: { at: number; sentence: string; lateUntil: string } | null;
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

/** Uploads waiting on this phone get a nudge when submissions close within this long. */
const CLOSING_SOON_MS = 60 * 60_000;

/**
 * Everything a team does on a task page: the form for the task's kind, the
 * waiting and done states, and uploads saved on this phone. An instant
 * acceptance (right answer, checkpoint code, auto-accepted photo) plays the
 * shared PunchCelebration once, then settles into the done state.
 *
 * When the player's own submission swaps the form for a result (done,
 * waiting for a judge, saved on this phone), focus moves to that result's
 * heading rather than falling back to the top of the page.
 */
export function TaskActionArea(props: TaskActionAreaProps) {
  const { huntId, slug, teamId, task, state, closedReason, wrongAttempts, punchedAt, latest } = props;
  const router = useRouter();
  const [punched, setPunched] = useState<Punched | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [lastState, setLastState] = useState(state);
  const queued = useQueuedUploads(huntId, task.id);
  const contest = task.kind === "contest";
  /** Set when this player's submission is about to replace the form with a result block. */
  const [focusResult, setFocusResult] = useState(false);
  const resultHeading = useRef<HTMLParagraphElement>(null);

  // Once the server reports a new state (our submission arrived, or a judge decided), it takes over.
  if (lastState !== state) {
    setLastState(state);
    setJustSent(false);
    // A judge can still overturn an instant acceptance.
    if (lastState === "approved") setPunched(null);
  }

  // The result block may render a moment later (a saved upload shows once the queue has it). An
  // instant acceptance focuses it straight away, under the celebration, so focus never rests on the page.
  useEffect(() => {
    if (!focusResult || !resultHeading.current) return;
    resultHeading.current.focus();
    setFocusResult(false);
  });

  function handleDone(reply: SubmissionReply) {
    const { status, points, id } = reply.submission;
    if (status === "approved" && !contest) {
      const headline = task.kind === "answer" ? "Correct!" : task.kind === "checkpoint" ? "Punched!" : "Accepted!";
      setPunched({ headline, points, key: id });
      setCelebrating(true);
      setFocusResult(true);
    } else if (status === "pending" && !contest) {
      setJustSent(true);
      setFocusResult(true);
    }
    router.refresh();
  }

  function handleQueued() {
    if (!contest) setFocusResult(true);
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
            <p
              ref={resultHeading}
              tabIndex={-1}
              className="font-cond text-2xl font-extrabold tracking-tight outline-none"
            >
              {punchedAt ? `Punched at ${punchedAt}` : "Punched"}
            </p>
            {punched ? (
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-ink">
                <span className="font-semibold">{punched.headline}</span>
                {punched.points ? (
                  <span>
                    <Numeral className="text-2xl text-forest">{formatSigned(punched.points)}</Numeral> points
                  </span>
                ) : null}
              </p>
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

  const block = (
    title: ReactNode,
    body: ReactNode,
    icon: ReactNode,
    tone: "sun" | "danger" | "mist" = "mist",
    titleRef?: Ref<HTMLParagraphElement>,
  ) => (
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
        <p ref={titleRef} tabIndex={titleRef ? -1 : undefined} className="font-semibold text-ink outline-none">
          {title}
        </p>
        {body ? <div className="mt-0.5 text-sm text-ink-2">{body}</div> : null}
      </div>
    </div>
  );

  // Only rendered once the queue has loaded in the browser, so reading the clock can't upset hydration.
  const closes = props.closes ?? null;
  const closesSoon = closes && closes.at > Date.now() && closes.at - Date.now() < CLOSING_SOON_MS ? closes : null;
  const savedInTime = !!closes && waiting.every((item) => item.createdAt < closes.at);
  const savedOnPhone =
    waiting.length > 0 ? (
      <div className="flex flex-col gap-3 rounded-lg border-2 border-dashed border-line-strong px-4 py-4">
        <div className="flex items-start gap-3">
          <CloudUpload aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p ref={resultHeading} tabIndex={-1} className="font-semibold outline-none">
              Saved on this phone
            </p>
            <p className="text-sm text-ink-2">
              {closedReason && closes
                ? savedInTime
                  ? `It was saved before this closed, so it still counts if it’s sent by ${closes.lateUntil}.`
                  : "It was saved after this closed, so it won’t count. You can remove it."
                : closesSoon
                  ? `It’ll send by itself when you’re back online. ${closesSoon.sentence}, so find signal before then.`
                  : "It’ll send by itself when you’re back online."}
            </p>
          </div>
          <SendNowButton className="-my-1 shrink-0" />
        </div>
        <QueuedUploadList items={waiting} />
      </div>
    ) : null;

  if (closedReason) {
    return (
      <div className="flex flex-col gap-4">
        {block(
          closedReason,
          state === "pending" ? "Your last submission is still with the judges." : props.closedNote,
          <Lock aria-hidden className="size-5 text-ink-2" />,
        )}
        {state === "pending" && latest ? latest : null}
        {savedOnPhone}
      </div>
    );
  }

  if (!contest && (state === "pending" || justSent)) {
    return (
      <div className="flex flex-col gap-4">
        {block(
          task.kind === "answer" ? "Sent to the judges" : "Waiting for a judge",
          task.kind === "answer"
            ? "If they don’t accept it, you can answer again."
            : "If they don’t accept it, you can send new proof.",
          <PendingGlyph />,
          "sun",
          resultHeading,
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
          `You’ve used all ${plural(task.maxAttempts ?? 0, "attempt")}. The other tasks are still open.`,
          <Lock aria-hidden className="size-5 text-danger" />,
          "danger",
          resultHeading,
        )}
        {latest}
      </div>
    );
  }

  // One submission at a time for standard tasks: wait for the saved one to go out.
  if (!contest && savedOnPhone) return savedOnPhone;

  const form =
    task.kind === "answer" ? (
      <AnswerForm
        huntId={huntId}
        teamId={teamId}
        task={task}
        wrongAttempts={wrongAttempts}
        onDone={handleDone}
        onQueued={handleQueued}
      />
    ) : task.kind === "checkpoint" ? (
      <CheckpointForm
        huntId={huntId}
        slug={slug}
        teamId={teamId}
        task={task}
        onDone={handleDone}
        onQueued={handleQueued}
      />
    ) : (
      <MediaForm
        huntId={huntId}
        teamId={teamId}
        task={task}
        accept={props.accept}
        maxUploadBytes={props.maxUploadBytes}
        onDone={handleDone}
        onQueued={handleQueued}
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
          <p className="font-semibold">Couldn’t send from this phone</p>
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
