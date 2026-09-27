"use client";

import { RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PunchCelebration } from "@/components/live/punch-celebration";
import { Button, ButtonLink } from "@/components/ui/button";
import { ControlMarker } from "@/components/ui/control";
import { Countdown } from "@/components/ui/countdown";
import { Spinner } from "@/components/ui/spinner";
import { onQueueEvent } from "@/lib/offline/queue";
import { PunchResult } from "./punch-result";
import { useSubmitter } from "./use-submitter";

export type LandingTask = { id: string; code: number; title: string };

/** What the server found for this poster, before anything is sent. */
export type LandingState =
  | { kind: "punch" }
  | { kind: "already"; punchedAt: string | null; points: number | null }
  | { kind: "waiting" }
  | { kind: "unknown" }
  | { kind: "not-open"; opensAt: number; opensAtLabel: string }
  | { kind: "closed"; reason: string; huntOver?: boolean }
  | { kind: "limit"; message: string };

type Local =
  | { kind: "punched"; points: number | null }
  | { kind: "already" }
  /** The hunt couldn't be reached: the punch waits on this phone and the upload queue sends it. */
  | { kind: "saved" }
  | { kind: "error"; message: string; retry: boolean };

/**
 * The page a checkpoint poster's QR code opens. For an open checkpoint it
 * punches once, right after loading (through the same submission API and
 * offline queue as the task page), then shows the result full screen. The
 * result is kept here, so a live refresh (which now finds the task done)
 * doesn't swap "Punched!" for "Already punched".
 */
export function CheckpointLanding({
  huntId,
  slug,
  code,
  huntName,
  task,
  state,
  serverNow,
}: {
  huntId: string;
  slug: string;
  /** The code from the link, normalized. */
  code: string;
  huntName: string;
  task: LandingTask | null;
  state: LandingState;
  serverNow: number;
}) {
  const [local, setLocal] = useState<Local | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const { submit, busy } = useSubmitter(huntId, task?.id ?? "");
  const started = useRef(false);
  const tasksHref = `/h/${slug}`;

  async function punch() {
    if (!task) return;
    setLocal(null);
    const outcome = await submit({ text: code, label: `Code for ${task.title}`, queueWhenBusy: false });
    switch (outcome.kind) {
      case "done": {
        const { submission, duplicate } = outcome.reply;
        if (submission.status === "approved") {
          setLocal({ kind: "punched", points: submission.points });
          setCelebrate(!duplicate);
        } else {
          // A judge overturned an earlier punch with this same id; nothing more to do here.
          setLocal({ kind: "error", message: "A judge has already looked at this punch.", retry: false });
        }
        break;
      }
      case "queued":
        setLocal({ kind: "saved" });
        break;
      case "refused":
        if (outcome.status === 409 && /already completed/i.test(outcome.error)) setLocal({ kind: "already" });
        else setLocal({ kind: "error", message: outcome.error, retry: outcome.status === 429 });
        break;
      case "cancelled":
        break;
    }
  }

  // A punch saved on this phone reports back here once the queue has sent it
  // (the live event then plays the "Punched!" moment).
  const saved = local?.kind === "saved";
  const taskId = task?.id ?? null;
  useEffect(() => {
    if (!saved || !taskId) return;
    return onQueueEvent((event) => {
      if (event.type === "changed" || event.taskId !== taskId) return;
      if (event.type === "sent") setLocal({ kind: "punched", points: event.result?.points ?? null });
      else setLocal({ kind: "error", message: event.error, retry: false });
    });
  }, [saved, taskId]);

  // Punch once, after the page has loaded (never while rendering it).
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per page view by design
  useEffect(() => {
    if (state.kind !== "punch" || started.current) return;
    started.current = true;
    void punch();
  }, []);

  const back = (
    <ButtonLink href={tasksHref} size="lg">
      Back to tasks
    </ButtonLink>
  );

  let body: React.ReactNode;
  if (local?.kind === "punched" && task) {
    body = (
      <>
        {celebrate ? (
          <PunchCelebration
            code={task.code}
            title={task.title}
            points={local.points}
            seed={task.id}
            onDone={() => setCelebrate(false)}
          />
        ) : null}
        <PunchResult code={task.code} seed={task.id} headline="Punched!" points={local.points} title={task.title}>
          {back}
        </PunchResult>
      </>
    );
  } else if (local?.kind === "already" && task) {
    body = (
      <PunchResult
        code={task.code}
        seed={task.id}
        headline="Already punched"
        title={task.title}
        note="Someone on your team got here first."
      >
        {back}
      </PunchResult>
    );
  } else if (local?.kind === "saved" && task) {
    body = (
      <Problem code={task.code} title="Saved on this phone" state="todo">
        <p>
          The hunt couldn't be reached, so the punch is waiting on this phone. Control {task.code} gets punched by
          itself as soon as the connection is back.
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col">{back}</div>
      </Problem>
    );
  } else if (local?.kind === "error") {
    body = (
      <Problem code={task?.code ?? "?"} title="Couldn't punch this checkpoint" state="rejected">
        <p>{local.message}</p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
          {local.retry ? (
            <Button size="lg" onClick={() => void punch()} pending={busy}>
              <RotateCw aria-hidden />
              Try again
            </Button>
          ) : null}
          <ButtonLink href={tasksHref} size="lg" variant={local.retry ? "secondary" : "primary"}>
            Back to tasks
          </ButtonLink>
        </div>
      </Problem>
    );
  } else if (state.kind === "punch" && task) {
    body = (
      <div className="flex flex-col items-center" aria-live="polite">
        <ControlMarker code={task.code} state="todo" size="xl" label={`Control ${task.code}`} />
        <p className="mt-8 flex items-center gap-2 font-cond text-3xl font-extrabold tracking-tight">
          <Spinner className="size-6 text-accent" />
          Punching control {task.code}
        </p>
        <p className="mt-2 text-lg text-ink-2">{task.title}</p>
      </div>
    );
  } else if (state.kind === "already" && task) {
    body = (
      <PunchResult
        code={task.code}
        seed={task.id}
        headline={state.punchedAt ? `Already punched at ${state.punchedAt}` : "Already punched"}
        points={state.points}
        title={task.title}
      >
        {back}
      </PunchResult>
    );
  } else if (state.kind === "waiting" && task) {
    body = (
      <Problem code={task.code} title="Waiting for a judge" state="pending">
        <p>Your team's punch for {task.title} is with the judges. Nothing more to do here.</p>
        <div className="mt-8 flex w-full max-w-xs flex-col">{back}</div>
      </Problem>
    );
  } else if (state.kind === "not-open") {
    body = (
      <Problem code={task?.code ?? "?"} title="This checkpoint isn't open yet" state="locked">
        <p>
          It opens at {state.opensAtLabel}, in{" "}
          <Countdown to={state.opensAt} serverNow={serverNow} className="text-xl text-ink" />. Scan the poster again
          then.
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col">{back}</div>
      </Problem>
    );
  } else if (state.kind === "closed") {
    body = (
      <Problem code={task?.code ?? "?"} title={state.reason} state="locked">
        <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
          {back}
          {state.huntOver ? (
            <ButtonLink href={`/h/${slug}/scoreboard`} size="lg" variant="secondary">
              See the final scoreboard
            </ButtonLink>
          ) : null}
        </div>
      </Problem>
    );
  } else if (state.kind === "limit") {
    body = (
      <Problem code="?" title="Too many codes tried" state="rejected">
        <p>{state.message}</p>
        <div className="mt-8 flex w-full max-w-xs flex-col">{back}</div>
      </Problem>
    );
  } else {
    body = (
      <Problem code="?" title="That code doesn't match a checkpoint" state="rejected">
        <p>
          No checkpoint in {huntName} uses it. Check that the poster belongs to this hunt, or type the code on the
          task's page instead.
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col">{back}</div>
      </Problem>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-13rem)] flex-col items-center justify-center py-8 text-center">{body}</div>
  );
}

function Problem({
  code,
  title,
  state,
  children,
}: {
  code: number | string;
  title: string;
  state: "todo" | "rejected" | "locked" | "pending";
  children?: React.ReactNode;
}) {
  return (
    <div className="flex max-w-sm flex-col items-center">
      <ControlMarker
        code={code}
        state={state}
        size="xl"
        label={typeof code === "number" ? `Control ${code}` : "Checkpoint"}
      />
      <h1 className="mt-8 font-cond text-4xl font-extrabold tracking-tight text-balance">{title}</h1>
      <div className="mt-3 flex flex-col items-center text-lg text-ink-2">{children}</div>
    </div>
  );
}
