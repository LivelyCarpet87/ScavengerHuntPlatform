import type { Hunt, Task } from "@/lib/db/schema";
import { huntPhase, isTaskVisible } from "@/lib/hunts";
import { decayValue, placementLadder } from "@/lib/scoring/engine";

/*
 * Shared wording and rules for tasks, used by the player task list, the task
 * page, the organizer editor and the judging queue — so a task is described
 * the same way everywhere.
 */

export type TaskLike = Pick<
  Task,
  | "kind"
  | "mediaAccept"
  | "answers"
  | "scoring"
  | "points"
  | "minPoints"
  | "decaySolves"
  | "contestRank"
  | "contestPlaces"
  | "contestUnit"
  | "autoApprove"
>;

/** Short, player-facing name for what the task asks for. */
export function kindLabel(task: Pick<Task, "kind" | "mediaAccept" | "answers">): string {
  switch (task.kind) {
    case "media":
      return task.mediaAccept === "video" ? "Video" : task.mediaAccept === "any" ? "Photo or video" : "Photo";
    case "answer":
      return "Answer";
    case "checkpoint":
      return "Checkpoint";
    case "contest":
      return "Contest";
  }
}

/** How proof gets judged, for players. */
export function judgingNote(task: Pick<Task, "kind" | "answers" | "autoApprove">): string {
  switch (task.kind) {
    case "answer":
      return task.answers.length > 0 ? "Checked instantly." : "A judge checks your answer.";
    case "checkpoint":
      return "Counts the moment you scan the code.";
    case "contest":
      return "Judges rank the entries.";
    case "media":
      return task.autoApprove ? "Counts right away; judges may still review it." : "A judge reviews your proof.";
  }
}

const RANK_WORDS: Record<Task["contestRank"], string> = {
  highest: "highest",
  lowest: "lowest",
  total: "biggest total",
  earliest: "first",
};

/**
 * One-line scoring explanation, e.g.
 *   "100 points"
 *   "Worth 150 for the first team, less for each team after (at least 60)."
 */
export function describeScoring(task: TaskLike): string {
  if (task.kind === "contest") {
    const ladder = placementLadder(task.contestPlaces, task.points, task.minPoints);
    const rank =
      task.contestRank === "earliest"
        ? "the first accepted entries"
        : `the ${RANK_WORDS[task.contestRank]} ${task.contestUnit ? `value (${task.contestUnit})` : "value"}`;
    return `Top ${task.contestPlaces} by ${rank} earn ${ladder.join(" / ")} points.`;
  }
  switch (task.scoring) {
    case "fixed":
      return `${task.points} points`;
    case "rarity":
      return `Worth ${task.points} while few teams have it; drops as more solve it (at least ${task.minPoints}).`;
    case "race":
      return `Worth ${task.points} for the first team, less for each team after (at least ${task.minPoints}).`;
  }
}

/** Values for the first `n` solves — for the editor's curve preview. */
export function scoringCurve(task: Pick<Task, "scoring" | "points" | "minPoints" | "decaySolves">, n = 10): number[] {
  return Array.from({ length: n }, (_, i) =>
    task.scoring === "fixed" ? task.points : decayValue(i + 1, task.points, task.minPoints, task.decaySolves),
  );
}

/** Upload types a media/contest task accepts, for <input accept>. */
export function acceptAttr(task: Pick<Task, "kind" | "mediaAccept">): string {
  if (task.kind !== "media" && task.kind !== "contest") return "";
  return task.mediaAccept === "video" ? "video/*" : task.mediaAccept === "any" ? "image/*,video/*" : "image/*";
}

export type TaskAvailability =
  | { state: "hidden" }
  | { state: "upcoming"; until: Date | null }
  | { state: "open" }
  | { state: "closed"; since: Date | null };

/** Whether players can see/submit a task right now. */
export function taskAvailability(
  task: Pick<Task, "hidden" | "unlockAt" | "lockAt">,
  hunt: Pick<Hunt, "status" | "startsAt" | "endsAt">,
  now = new Date(),
): TaskAvailability {
  if (task.hidden) return { state: "hidden" };
  const phase = huntPhase(hunt, now);
  if (phase === "draft" || phase === "upcoming") return { state: "upcoming", until: hunt.startsAt };
  if (!isTaskVisible(task, now)) return { state: "upcoming", until: task.unlockAt };
  if (phase === "ended" || phase === "archived") return { state: "closed", since: hunt.endsAt };
  if (task.lockAt && now >= task.lockAt) return { state: "closed", since: task.lockAt };
  return { state: "open" };
}
