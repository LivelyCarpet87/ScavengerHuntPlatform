import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { CheckpointLanding, type LandingState } from "@/components/task/checkpoint-landing";
import { StopScreen, StopScreenFrame } from "@/components/task/stop-screen";
import { ButtonLink } from "@/components/ui/button";
import { ControlMarker, StartMark } from "@/components/ui/control";
import { getPlayerHunt } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { type Hunt, submissions } from "@/lib/db/schema";
import { formatDateTime, formatTime } from "@/lib/format";
import { huntPhase, isTaskVisible, submissionBlockReason } from "@/lib/hunts";
import { normalizeCode } from "@/lib/ids";
import { joinPolicy } from "@/lib/player/join";
import { codeGuard } from "@/lib/player/queries";
import { checkpointLookupLimit, findCheckpointTask } from "@/lib/player/submit";
import { getStandings } from "@/lib/scoring/service";
import { links } from "@/lib/url";

export const metadata: Metadata = { title: "Checkpoint", robots: { index: false } };

type Params = Promise<{ slug: string; code: string }>;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * The hunt code for a visitor's join link, when starting a team needs it and
 * the scanned checkpoint is real: someone holding a working checkpoint poster
 * is at the event, and a checkpoint poster doesn't show the hunt code. A code
 * that matches nothing counts as a wrong hunt code for the network, so this
 * can't be used to guess either.
 */
async function huntCodeForVisitor(hunt: Hunt, code: string): Promise<string | null> {
  if (!joinPolicy(hunt, huntPhase(hunt)).needsHuntCode) return null;
  const guard = await codeGuard("hunt");
  if (guard.retryAfterSec) return null;
  const task = code ? await findCheckpointTask(hunt.id, code) : null;
  if (!task || task.hidden) {
    guard.miss();
    return null;
  }
  return hunt.joinCode;
}

/**
 * /h/[slug]/cp/[code] — where a checkpoint poster's QR code leads. Players on
 * a team get the checkpoint punched (by the page, once it has loaded);
 * visitors are sent to join first and come straight back; staff can check
 * that a poster works without punching anything.
 */
export default async function CheckpointPage({ params }: { params: Params }) {
  const { slug, code: rawCode } = await params;
  const { hunt, me, staffRole } = await getPlayerHunt(slug);
  const code = normalizeCode(safeDecode(rawCode));
  const here = links.checkpoint(slug, code || rawCode);
  const phase = huntPhase(hunt);

  if (!me) {
    const task = staffRole ? await findCheckpointTask(hunt.id, code) : null;
    if (staffRole) {
      const now = new Date();
      const opensLater = !!task && !task.hidden && !!task.unlockAt && task.unlockAt > now;
      const when = task?.hidden
        ? " once the task is shown to players"
        : opensLater && task?.unlockAt
          ? ` from ${formatTime(task.unlockAt, hunt.timezone)}, when the task opens`
          : "";
      return (
        <StopScreenFrame>
          <StopScreen
            mark={
              <ControlMarker
                code={task?.code ?? "?"}
                state={!task ? "rejected" : task.hidden || opensLater ? "locked" : "todo"}
                size="xl"
                label={task ? `Control ${task.code}` : "Checkpoint"}
              />
            }
            title={
              !task
                ? "This code doesn’t match a checkpoint"
                : task.hidden
                  ? "This poster works, but its task is hidden"
                  : "This poster works"
            }
            actions={
              <ButtonLink href={links.manage(hunt.id)} size="lg" variant="secondary">
                Open the organizer view
              </ButtonLink>
            }
          >
            <p>
              {task
                ? `It punches control ${task.code}, “${task.title}”, for the team that scans it${when}. You’re signed in as staff, so nothing was punched.`
                : `No checkpoint task in ${hunt.name} uses the code ${code || rawCode}. Check the code in the task editor.`}
            </p>
          </StopScreen>
        </StopScreenFrame>
      );
    }
    const over = phase === "ended" || phase === "archived";
    const huntCode = over ? null : await huntCodeForVisitor(hunt, code);
    const joinHref = `${links.hunt(slug)}?next=${encodeURIComponent(here)}${huntCode ? `&code=${huntCode}` : ""}`;
    return (
      <StopScreenFrame>
        <StopScreen
          mark={<StartMark size={64} />}
          title={over ? `${hunt.name} is over` : `You found a checkpoint for ${hunt.name}`}
          actions={
            <ButtonLink href={over ? links.hunt(slug) : joinHref} size="lg">
              {over ? "See the results" : "Join the hunt"}
            </ButtonLink>
          }
        >
          <p>
            {over
              ? "Checkpoints can’t be punched any more, but the results are still up."
              : "Join the hunt on this phone to punch it. You’ll come straight back here."}
          </p>
        </StopScreen>
      </StopScreenFrame>
    );
  }

  const task = code ? await findCheckpointTask(hunt.id, code) : null;
  const now = new Date();
  const tz = hunt.timezone;
  let state: LandingState;

  if (!task || task.hidden) {
    // Guessing codes by editing the link is capped (the page tells whether a code exists).
    const limit = checkpointLookupLimit(me.team.id);
    state = limit.ok
      ? { kind: "unknown" }
      : { kind: "limit", message: `Wait ${limit.retryAfterSec} s, then scan the poster again.` };
  } else {
    const subs = await db
      .select({ status: submissions.status, createdAt: submissions.createdAt })
      .from(submissions)
      .where(and(eq(submissions.teamId, me.team.id), eq(submissions.taskId, task.id)));
    const solves = subs.filter((s) => s.status === "approved").sort((a, b) => +a.createdAt - +b.createdAt);
    const blocked = submissionBlockReason(hunt, task, now);
    if (solves.length > 0) {
      const standings = await getStandings(hunt.id);
      state = {
        kind: "already",
        punchedAt: formatTime(solves[0].createdAt, tz),
        points: standings.awards[me.team.id]?.[task.id] ?? null,
      };
    } else if (subs.some((s) => s.status === "pending")) {
      state = { kind: "waiting" };
    } else if (phase === "live" && !isTaskVisible(task, now) && task.unlockAt) {
      state = { kind: "not-open", opensAt: task.unlockAt.getTime(), opensAtLabel: formatTime(task.unlockAt, tz) };
    } else if (phase === "upcoming" && hunt.startsAt) {
      state = {
        kind: "not-open",
        opensAt: hunt.startsAt.getTime(),
        opensAtLabel: formatDateTime(hunt.startsAt, tz),
      };
    } else if (blocked) {
      state = { kind: "closed", reason: blocked, huntOver: phase === "ended" || phase === "archived" };
    } else {
      state = { kind: "punch" };
    }
  }

  // Before a task unlocks, players only learn its control code, not its title.
  const reveal = task && !task.hidden && (state.kind !== "not-open" || isTaskVisible(task, now));
  return (
    <CheckpointLanding
      huntId={hunt.id}
      slug={slug}
      teamId={me.team.id}
      code={code}
      huntName={hunt.name}
      task={task && !task.hidden ? { id: task.id, code: task.code, title: reveal ? task.title : "" } : null}
      state={state}
      serverNow={now.getTime()}
    />
  );
}
