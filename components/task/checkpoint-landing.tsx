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
import { StopScreen, StopScreenFrame } from "./stop-screen";
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
 *
 * A fresh punch plays PunchCelebration first and shows the resting
 * PunchResult only once it has finished — never both at once.
 */
export function CheckpointLanding({
  huntId,
  slug,
  teamId,
  code,
  huntName,
  task,
  state,
  serverNow,
}: {
  huntId: string;
  slug: string;
  /** The player's team; the punch is only ever sent for it. */
  teamId: string;
  /** The code from the link, normalized. */
  code: string;
  huntName: string;
  task: LandingTask | null;
  state: LandingState;
  serverNow: number;
}) {
  const [local, setLocal] = useState<Local | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  /** The celebration just ended: the resting result arrives with a short pop. */
  const [settling, setSettling] = useState(false);
  const { submit, busy } = useSubmitter(huntId, task?.id ?? "", teamId);
  const started = useRef(false);
  const result = useRef<HTMLDivElement>(null);
  /** Set by "Try again": the result replaces the focused button, so focus follows it there. */
  const focusResult = useRef(false);
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
        if (outcome.code === "already_completed") setLocal({ kind: "already" });
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
      // A teammate punched it while this one waited for signal.
      else if (event.type === "already") setLocal({ kind: "already" });
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

  useEffect(() => {
    if (!local || celebrate || !focusResult.current) return;
    focusResult.current = false;
    result.current?.focus();
  }, [local, celebrate]);

  const back = (
    <ButtonLink href={tasksHref} size="lg">
      Back to tasks
    </ButtonLink>
  );

  let body: React.ReactNode;
  if (local?.kind === "punched" && task) {
    body = celebrate ? (
      <PunchCelebration
        code={task.code}
        title={task.title}
        points={local.points}
        seed={task.id}
        onDone={() => {
          setCelebrate(false);
          setSettling(true);
        }}
      />
    ) : (
      <PunchResult
        code={task.code}
        seed={task.id}
        headline="Punched!"
        points={local.points}
        title={task.title}
        className={settling ? "animate-pop" : undefined}
      >
        {back}
      </PunchResult>
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
      <StopScreen
        mark={<ControlMarker code={task.code} state="todo" size="xl" label={`Control ${task.code}`} />}
        title="Saved on this phone"
        actions={back}
      >
        <p>
          The hunt couldn’t be reached, so the punch is waiting on this phone. Control {task.code} gets punched by
          itself as soon as the connection is back.
        </p>
      </StopScreen>
    );
  } else if (local?.kind === "error") {
    body = (
      <StopScreen
        mark={<ControlMarker code={task?.code ?? "?"} state="rejected" size="xl" label={controlLabel(task)} />}
        title="Couldn’t punch this checkpoint"
        actions={
          <>
            {local.retry ? (
              <Button
                size="lg"
                onClick={() => {
                  focusResult.current = true;
                  void punch();
                }}
                pending={busy}
              >
                <RotateCw aria-hidden />
                Try again
              </Button>
            ) : null}
            <ButtonLink href={tasksHref} size="lg" variant={local.retry ? "secondary" : "primary"}>
              Back to tasks
            </ButtonLink>
          </>
        }
      >
        <p>{local.message}</p>
      </StopScreen>
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
      <StopScreen
        mark={<ControlMarker code={task.code} state="pending" size="xl" label={`Control ${task.code}`} />}
        title="Waiting for a judge"
        actions={back}
      >
        <p>Your team’s punch for {task.title} is with the judges. Nothing more to do here.</p>
      </StopScreen>
    );
  } else if (state.kind === "not-open") {
    body = (
      <StopScreen
        mark={<ControlMarker code={task?.code ?? "?"} state="locked" size="xl" label={controlLabel(task)} />}
        title="This checkpoint isn’t open yet"
        actions={back}
      >
        <p>
          It opens at {state.opensAtLabel}, in{" "}
          <Countdown to={state.opensAt} serverNow={serverNow} className="text-xl text-ink" />. Scan the poster again
          then.
        </p>
      </StopScreen>
    );
  } else if (state.kind === "closed") {
    body = (
      <StopScreen
        mark={<ControlMarker code={task?.code ?? "?"} state="locked" size="xl" label={controlLabel(task)} />}
        title={state.reason}
        actions={
          <>
            {back}
            {state.huntOver ? (
              <ButtonLink href={`/h/${slug}/scoreboard`} size="lg" variant="secondary">
                See the final scoreboard
              </ButtonLink>
            ) : null}
          </>
        }
      />
    );
  } else if (state.kind === "limit") {
    body = (
      <StopScreen
        mark={<ControlMarker code="?" state="rejected" size="xl" label="Checkpoint" />}
        title="Too many codes tried"
        actions={back}
      >
        <p>{state.message}</p>
      </StopScreen>
    );
  } else {
    body = (
      <StopScreen
        mark={<ControlMarker code="?" state="rejected" size="xl" label="Checkpoint" />}
        title="That code doesn’t match a checkpoint"
        actions={back}
      >
        <p>
          No checkpoint in {huntName} uses it. Check that the poster belongs to this hunt, or type the code on the
          task’s page instead.
        </p>
      </StopScreen>
    );
  }

  return (
    <StopScreenFrame>
      <div ref={result} tabIndex={-1} className="flex flex-col items-center outline-none">
        {body}
      </div>
    </StopScreenFrame>
  );
}

function controlLabel(task: LandingTask | null): string {
  return task ? `Control ${task.code}` : "Checkpoint";
}
