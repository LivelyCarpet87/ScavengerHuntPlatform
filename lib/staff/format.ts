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

/** The number of solves a preview should show: every step down to the floor. */
function curveLength(t: Pick<Task, "decaySolves">): number {
  return Math.min(Math.max(2, Math.floor(t.decaySolves) || 2), 20);
}

/** Value of each solve from the 1st to the one that reaches the minimum (engine rules). */
export function curveValues(t: CurveInput): number[] {
  const n = curveLength(t);
  return Array.from({ length: n }, (_, i) =>
    t.scoring === "fixed" ? t.points : decayValue(i + 1, t.points, t.minPoints, t.decaySolves),
  );
}

/**
 * Text twin of the curve preview, e.g.
 *   race:   "1st: 150, 2nd: 147 … 6th+: 60"
 *   rarity: "1 team: 150 each, 2 teams: 147 each … 6+ teams: 60 each"
 */
export function describeCurve(t: CurveInput): string {
  if (t.scoring === "fixed") return `Every team that solves it earns ${formatPoints(t.points)}.`;
  const values = curveValues(t);
  const n = values.length;
  const label = (i: number, last: boolean) => {
    const pos = i + 1;
    if (t.scoring === "race") return last ? `${ordinal(pos)}+` : ordinal(pos);
    const teams = last ? `${pos}+ teams` : pos === 1 ? "1 team" : `${pos} teams`;
    return teams;
  };
  const item = (i: number) => {
    const last = i === n - 1;
    const v = formatPoints(values[i]);
    return `${label(i, last)}: ${t.scoring === "rarity" ? `${v} each` : v}`;
  };
  if (n <= 4) return values.map((_, i) => item(i)).join(", ");
  return `${item(0)}, ${item(1)} … ${item(n - 1)}`;
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
        : `${formatPoints(ladder[0])} → ${formatPoints(ladder[ladder.length - 1])}`;
    return { value, note: `Top ${ladder.length}, ${RANK_NOTES[t.contestRank]}` };
  }
  if (t.scoring === "fixed") return { value: formatPoints(t.points), note: "Fixed" };
  const floor = Math.min(t.minPoints, t.points);
  return {
    value: `${formatPoints(t.points)} → ${formatPoints(floor)}`,
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
