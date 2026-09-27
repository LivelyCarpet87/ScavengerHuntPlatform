import type { ControlState } from "@/components/ui/control";
import type { CardCell } from "@/components/ui/punch";
import type { Task } from "@/lib/db/schema";
import { formatPoints, formatTime, ordinal } from "@/lib/format";
import type { HuntPhase } from "@/lib/hunts";
import type { TaskProgress } from "@/lib/player/progress";
import type { Standings } from "@/lib/scoring/service";
import { kindLabel } from "@/lib/tasks";
import { links } from "@/lib/url";
import type { TaskIcon, TaskRowData } from "./task-list";

/** How long a newly accepted task keeps its punch animation on the control card. */
const FRESH_MS = 2 * 60_000;

function iconFor(task: Pick<Task, "kind" | "mediaAccept">): TaskIcon {
  if (task.kind !== "media") return task.kind;
  return task.mediaAccept === "video" ? "video" : task.mediaAccept === "any" ? "media" : "photo";
}

/** When the team's accepted proof was decided (for the "fresh" punch). */
function acceptedAt(progress: TaskProgress | undefined): number | null {
  const solves = progress?.submissions.filter((s) => s.status === "approved") ?? [];
  if (solves.length === 0) return null;
  const first = solves.reduce((a, b) => (b.createdAt < a.createdAt ? b : a));
  return (first.judgedAt ?? first.createdAt).getTime();
}

/**
 * Rows for the task list and cells for the control card, from the team's
 * progress and the (possibly frozen) standings. Only safe, display-ready
 * fields leave the server — never answers or checkpoint codes.
 */
export function buildTaskBoard({
  tasks,
  progress,
  standings,
  teamId,
  slug,
  phase,
  timezone,
  now,
}: {
  tasks: Task[];
  progress: Map<string, TaskProgress>;
  standings: Standings;
  teamId: string;
  slug: string;
  phase: HuntPhase;
  timezone: string;
  now: number;
}): { rows: TaskRowData[]; cells: CardCell[]; done: number } {
  const over = phase === "ended" || phase === "archived";
  // During a scoreboard freeze, points for anything accepted after it stay hidden.
  const frozen = standings.cutoff != null;
  const rows: TaskRowData[] = [];
  const cells: CardCell[] = [];
  let done = 0;

  for (const task of tasks) {
    const p = progress.get(task.id);
    const state = p?.state ?? "todo";
    const closed = !!task.lockAt && task.lockAt.getTime() <= now;
    const triesLeft =
      task.kind === "answer" && task.maxAttempts != null
        ? Math.max(0, task.maxAttempts - (p?.wrongAttempts ?? 0))
        : null;
    const outOfTries = triesLeft === 0 && state !== "approved";
    const open = !over && !closed && !outOfTries;

    const marker: ControlState = state === "approved" || state === "pending" ? state : open ? state : "locked";
    const bucket: TaskRowData["bucket"] =
      state === "approved" ? "done" : state === "pending" ? "review" : open ? "todo" : null;
    if (state === "approved") done += 1;

    const award = standings.awards[teamId]?.[task.id];
    const stat = standings.tasks[task.id];
    let points: TaskRowData["points"];
    let status: TaskRowData["status"] = null;

    if (task.kind === "contest") {
      const entry = stat?.contest?.find((e) => e.teamId === teamId);
      if (state === "approved") {
        points =
          award != null
            ? {
                value: `+${formatPoints(award)}`,
                caption: over ? "earned" : "so far",
                srText: `${award} points so far`,
              }
            : frozen && !entry
              ? { value: null, frozen: true, caption: "so far", srText: "points show when the scoreboard unfreezes" }
              : { value: null, caption: over ? "earned" : "so far", srText: "no placing points yet" };
        status = entry
          ? {
              tone: "approved",
              text: over ? `Placed ${ordinal(entry.place)}` : `Placed ${ordinal(entry.place)} so far`,
            }
          : { tone: "approved", text: "Entry accepted" };
      } else {
        points = {
          value: formatPoints(task.points),
          caption: "up to",
          muted: !open,
          srText: `up to ${task.points} points`,
        };
      }
    } else if (state === "approved") {
      points =
        award != null
          ? { value: `+${formatPoints(award)}`, caption: "earned", srText: `earned ${award} points` }
          : { value: null, frozen, caption: "earned", srText: "points show when the scoreboard unfreezes" };
    } else {
      const worth = stat?.nextValue ?? task.points;
      points = { value: formatPoints(worth), caption: "worth", muted: !open, srText: `worth ${worth} points` };
    }

    if (state === "pending") {
      status = { tone: "pending", text: "In review" };
    } else if (state === "rejected") {
      if (task.kind === "answer") {
        status = {
          tone: "rejected",
          text: outOfTries
            ? "No tries left"
            : triesLeft != null
              ? `Wrong answer, ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left`
              : "Wrong answer, try again",
        };
      } else {
        status = { tone: "rejected", text: open ? "Not accepted — open to see why" : "Not accepted" };
      }
    }
    if (!status && state !== "approved" && !over && task.lockAt) {
      status = closed
        ? { tone: "neutral", text: "Closed" }
        : { tone: "neutral", text: `Closes ${formatTime(task.lockAt, timezone)}` };
    }

    const href = links.task(slug, task.id);
    const solvedAt = state === "approved" ? acceptedAt(p) : null;
    rows.push({
      id: task.id,
      href,
      code: task.code,
      title: task.title,
      kindLabel: kindLabel(task),
      icon: iconFor(task),
      category: task.category?.trim() || null,
      marker,
      bucket,
      points,
      status,
    });
    cells.push({
      id: task.id,
      code: task.code,
      title: task.title,
      state: marker,
      href,
      fresh: solvedAt != null && now - solvedAt < FRESH_MS,
    });
  }

  return { rows, cells, done };
}
