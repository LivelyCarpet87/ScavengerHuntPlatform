import type { Hunt, Task } from "@/lib/db/schema";
import { formatDate, formatDateTime, formatPoints, formatTime, ordinal } from "@/lib/format";
import { decayValue, placementLadder } from "@/lib/scoring/engine";

/*
 * Organizer-facing wording for schedules and scoring. Pure (no server
 * imports) so the task editor's live preview can use it in the browser.
 */

/** "Sat 27 Sep, 19:00–21:30", "Starts Sat 27 Sep, 19:00", "No start or end time yet". */
export function formatSchedule(start: Date | null, end: Date | null, timeZone: string): string {
  if (start && end) {
    const sameDay = formatDate(start, timeZone) === formatDate(end, timeZone);
    return sameDay
      ? `${formatDateTime(start, timeZone)}–${formatTime(end, timeZone)}`
      : `${formatDateTime(start, timeZone)} – ${formatDateTime(end, timeZone)}`;
  }
  if (start) return `Starts ${formatDateTime(start, timeZone)}`;
  if (end) return `Ends ${formatDateTime(end, timeZone)}`;
  return "No start or end time yet";
}

export type CurveInput = Pick<Task, "scoring" | "points" | "minPoints" | "decaySolves">;
export type LadderInput = Pick<Task, "points" | "minPoints" | "contestPlaces">;

/** Most bars a curve preview draws; longer curves are sampled evenly. */
export const CURVE_PREVIEW_POINTS = 20;

/** The solve that reaches the minimum (the engine's `decaySolves`, at least 2). */
function floorSolve(t: Pick<Task, "decaySolves">): number {
  return Math.max(2, Math.floor(t.decaySolves) || 2);
}

function solveValue(t: CurveInput, solves: number): number {
  return t.scoring === "fixed" ? t.points : decayValue(solves, t.points, t.minPoints, t.decaySolves);
}

/**
 * The points a curve preview shows, from the 1st solve to the one that
 * reaches the minimum (engine rules). Up to 20 solves each get a point; longer
 * curves are sampled at 20 evenly spaced solve counts that always include the
 * 1st and the last, each labelled with its real solve count.
 */
export function curvePoints(t: CurveInput): { solves: number; value: number }[] {
  const floor = floorSolve(t);
  const n = Math.min(floor, CURVE_PREVIEW_POINTS);
  return Array.from({ length: n }, (_, i) => {
    const solves = floor <= CURVE_PREVIEW_POINTS ? i + 1 : 1 + Math.round((i * (floor - 1)) / (n - 1));
    return { solves, value: solveValue(t, solves) };
  });
}

/** Value of each previewed solve (see curvePoints). */
export function curveValues(t: CurveInput): number[] {
  return curvePoints(t).map((p) => p.value);
}

/**
 * Label for a point on the curve: "3rd" (race) or "3 teams" (rarity). The
 * last point is the minimum, which holds for every later solve too: "30th+",
 * "30+ teams".
 */
export function curveLabel(scoring: Task["scoring"], solves: number, last: boolean): string {
  const plus = last ? "+" : "";
  if (scoring === "race") return `${ordinal(solves)}${plus}`;
  return `${solves}${plus} ${solves === 1 && !last ? "team" : "teams"}`;
}

/**
 * Text twin of the curve preview, e.g.
 *   race:   "1st: 150, 2nd: 147 … 6th+: 60"
 *   rarity: "1 team: 150 each, 2 teams: 147 each … 6+ teams: 60 each"
 * It names real solve counts, however long the curve.
 */
export function describeCurve(t: CurveInput): string {
  if (t.scoring === "fixed") return `Every team that solves it earns ${formatPoints(t.points)}.`;
  const floor = floorSolve(t);
  const item = (solves: number) => {
    const v = formatPoints(solveValue(t, solves));
    return `${curveLabel(t.scoring, solves, solves === floor)}: ${t.scoring === "rarity" ? `${v} each` : v}`;
  };
  if (floor <= 4) return Array.from({ length: floor }, (_, i) => item(i + 1)).join(", ");
  return `${item(1)}, ${item(2)} … ${item(floor)}`;
}

export function ladderValues(t: LadderInput): number[] {
  const places = Math.min(Math.max(1, Math.floor(t.contestPlaces) || 1), 20);
  return placementLadder(places, t.points, t.minPoints);
}

/** "1st: 200, 2nd: 101, 3rd: 60" (long ladders are shortened with an ellipsis). */
export function describeLadder(t: LadderInput): string {
  const values = ladderValues(t);
  const item = (i: number) => `${ordinal(i + 1)}: ${formatPoints(values[i])}`;
  if (values.length <= 5) return values.map((_, i) => item(i)).join(", ");
  return `${item(0)}, ${item(1)} … ${item(values.length - 1)}`;
}

const RANK_NOTES: Record<Task["contestRank"], string> = {
  highest: "highest wins",
  lowest: "lowest wins",
  total: "biggest total",
  earliest: "first in wins",
};

/** Compact scoring for task lists: a value and a short note. */
export function scoringSummary(
  t: Pick<Task, "kind" | "scoring" | "points" | "minPoints" | "decaySolves" | "contestPlaces" | "contestRank">,
): { value: string; note: string } {
  if (t.kind === "contest") {
    const ladder = ladderValues(t);
    const value =
      ladder.length <= 3
        ? ladder.map(formatPoints).join(" / ")
        : `${formatPoints(ladder[0])}–${formatPoints(ladder[ladder.length - 1])}`;
    return { value, note: `Top ${ladder.length}, ${RANK_NOTES[t.contestRank]}` };
  }
  if (t.scoring === "fixed") return { value: formatPoints(t.points), note: "Fixed" };
  const floor = Math.min(t.minPoints, t.points);
  return {
    value: `${formatPoints(t.points)}–${formatPoints(floor)}`,
    note: t.scoring === "rarity" ? "Rarity" : "Race",
  };
}

/**
 * A task's own timing for organizer lists, in the hunt's time zone:
 * "Unlocks 20:25", "Closes Sat 27 Sep, 21:00", "Closed 21:00".
 */
export function taskTiming(
  t: Pick<Task, "unlockAt" | "lockAt">,
  timeZone: string,
  now = new Date(),
): { unlock: string | null; close: string | null; closed: boolean } {
  const when = (d: Date) =>
    formatDate(d, timeZone) === formatDate(now, timeZone) ? formatTime(d, timeZone) : formatDateTime(d, timeZone);
  const closed = !!t.lockAt && t.lockAt <= now;
  return {
    unlock: t.unlockAt && t.unlockAt > now ? `Unlocks ${when(t.unlockAt)}` : null,
    close: t.lockAt ? `${closed ? "Closed" : "Closes"} ${when(t.lockAt)}` : null,
    closed,
  };
}

/** Most points a single team can take from a task (1st place for contests). */
export function maxTaskPoints(t: Pick<Task, "points">): number {
  return Math.max(0, t.points);
}

/** What happens the moment a draft is published, given its schedule. */
export function publishConsequence(hunt: Pick<Hunt, "startsAt" | "endsAt" | "timezone">, now = new Date()): string {
  if (hunt.startsAt && hunt.startsAt > now) {
    return `Teams can find it and register straight away. Tasks appear when it starts, ${formatDateTime(hunt.startsAt, hunt.timezone)}.`;
  }
  if (hunt.endsAt) {
    return `It goes live immediately: players can join and see every task until it ends, ${formatDateTime(hunt.endsAt, hunt.timezone)}.`;
  }
  return "It goes live immediately, with no end time: players can join and submit until you archive it.";
}

/** Whether a team has any points activity yet; before that its shared "rank" means nothing. */
export function hasScored(s: { lastScoredAt: number | null; total: number }): boolean {
  return s.lastScoredAt != null || s.total !== 0;
}
