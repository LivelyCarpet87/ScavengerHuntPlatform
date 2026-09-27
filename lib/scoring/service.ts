import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adjustments, hintUnlocks, submissions, type Team, tasks, teams } from "@/lib/db/schema";
import { huntVersion } from "@/lib/realtime/bus";
import { computeStandings, type EngineResult, type TeamStanding } from "./engine";

export type StandingsTeam = Pick<Team, "id" | "name" | "emoji" | "color" | "hidden">;
export type Standings = EngineResult & {
  teams: Record<string, StandingsTeam>;
  /** The freeze instant these standings were computed at, or null for live. */
  cutoff: number | null;
  computedAt: number;
};

type CacheEntry = { version: number; value: Promise<Standings> };
type CacheGlobal = { __shpStandings?: Map<string, CacheEntry> };
const g = globalThis as CacheGlobal;
const cache = g.__shpStandings ?? new Map<string, CacheEntry>();
g.__shpStandings = cache;
const MAX_ENTRIES = 200;

/**
 * Standings for a hunt, memoized until the next event on the hunt's bus
 * (every mutation publishes one). `cutoff` is the scoreboard freeze instant
 * for non-staff viewers — see scoreboardCutoff() in lib/hunts.ts.
 */
export function getStandings(huntId: string, opts: { cutoff?: Date | null } = {}): Promise<Standings> {
  const cutoff = opts.cutoff ? opts.cutoff.getTime() : null;
  const key = `${huntId}:${cutoff ?? "live"}`;
  const version = huntVersion(huntId);
  const hit = cache.get(key);
  if (hit && hit.version === version) return hit.value;

  const value = load(huntId, cutoff);
  cache.set(key, { version, value });
  value.catch(() => cache.delete(key));
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return value;
}

async function load(huntId: string, cutoff: number | null): Promise<Standings> {
  const [teamRows, taskRows, subRows, hintRows, adjRows] = await Promise.all([
    db
      .select({ id: teams.id, name: teams.name, emoji: teams.emoji, color: teams.color, hidden: teams.hidden })
      .from(teams)
      .where(eq(teams.huntId, huntId)),
    db
      .select({
        id: tasks.id,
        kind: tasks.kind,
        scoring: tasks.scoring,
        points: tasks.points,
        minPoints: tasks.minPoints,
        decaySolves: tasks.decaySolves,
        contestRank: tasks.contestRank,
        contestPlaces: tasks.contestPlaces,
      })
      .from(tasks)
      .where(eq(tasks.huntId, huntId)),
    db
      .select({
        id: submissions.id,
        taskId: submissions.taskId,
        teamId: submissions.teamId,
        status: submissions.status,
        createdAt: submissions.createdAt,
        judgedAt: submissions.judgedAt,
        pointsOverride: submissions.pointsOverride,
        contestValue: submissions.contestValue,
      })
      .from(submissions)
      .where(and(eq(submissions.huntId, huntId), eq(submissions.status, "approved"))),
    db
      .select({ teamId: hintUnlocks.teamId, cost: hintUnlocks.cost, createdAt: hintUnlocks.createdAt })
      .from(hintUnlocks)
      .where(eq(hintUnlocks.huntId, huntId)),
    db
      .select({ teamId: adjustments.teamId, points: adjustments.points, createdAt: adjustments.createdAt })
      .from(adjustments)
      .where(eq(adjustments.huntId, huntId)),
  ]);

  const result = computeStandings({
    teams: teamRows.map((t) => ({ id: t.id, name: t.name, hidden: t.hidden })),
    tasks: taskRows,
    submissions: subRows.map((s) => ({
      id: s.id,
      taskId: s.taskId,
      teamId: s.teamId,
      status: s.status,
      submittedAt: s.createdAt.getTime(),
      judgedAt: s.judgedAt?.getTime() ?? null,
      pointsOverride: s.pointsOverride,
      contestValue: s.contestValue,
    })),
    hintUnlocks: hintRows.map((h) => ({ teamId: h.teamId, cost: h.cost, at: h.createdAt.getTime() })),
    adjustments: adjRows.map((a) => ({ teamId: a.teamId, points: a.points, at: a.createdAt.getTime() })),
    cutoff,
  });

  return {
    ...result,
    teams: Object.fromEntries(teamRows.map((t) => [t.id, t])),
    cutoff,
    computedAt: Date.now(),
  };
}

/** Convenience: one team's standing (or undefined if the team isn't in the hunt). */
export function standingFor(standings: Standings, teamId: string): TeamStanding | undefined {
  return standings.standings.find((s) => s.teamId === teamId);
}

/** Number of visible (ranked) teams. */
export function rankedCount(standings: Standings): number {
  return standings.standings.filter((s) => s.rank != null).length;
}
