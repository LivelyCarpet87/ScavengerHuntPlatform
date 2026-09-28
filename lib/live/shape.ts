/*
 * Pure shaping of engine results for the live views (no server imports, so
 * it is unit-tested directly).
 */

import type { ScoreboardViewer } from "@/lib/hunts";
import type { EngineResult } from "@/lib/scoring/engine";
import type { StandingsTeam } from "@/lib/scoring/service";
import type { StandingRow } from "./types";

/** Scoreboard rows for a viewer: hidden teams (rank null) only reach staff. */
export function toRows(
  standings: Pick<EngineResult, "standings"> & { teams: Record<string, StandingsTeam> },
  viewer: ScoreboardViewer,
): StandingRow[] {
  const rows: StandingRow[] = [];
  for (const s of standings.standings) {
    if (s.hidden && !viewer.isStaff) continue;
    const team = standings.teams[s.teamId];
    if (!team) continue;
    rows.push({
      rank: s.rank,
      teamId: s.teamId,
      name: team.name,
      emoji: team.emoji,
      color: team.color,
      total: s.total,
      solved: s.solved,
      placements: s.placements,
      hidden: s.hidden,
    });
  }
  return rows;
}

export type AcceptedSubmission = {
  id: string;
  teamId: string;
  taskId: string;
  taskKind: "media" | "answer" | "checkpoint" | "contest";
  /** When the team submitted (ms). */
  submittedAt: number;
};

/**
 * The points to show next to each accepted submission, newest first:
 * a standard task's award belongs to the team's solve (its earliest accepted
 * submission) and repeats show none; a contest's current placement points sit
 * on the team's newest accepted entry.
 */
export function pointsForSubmissions(
  newestFirst: AcceptedSubmission[],
  standings: Pick<EngineResult, "awards" | "solvedAt">,
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  const contestSeen = new Set<string>();
  for (const sub of newestFirst) {
    const award = standings.awards[sub.teamId]?.[sub.taskId];
    let points: number | null = null;
    if (award != null) {
      if (sub.taskKind === "contest") {
        const key = `${sub.teamId}:${sub.taskId}`;
        if (!contestSeen.has(key)) points = award;
        contestSeen.add(key);
      } else if (standings.solvedAt[sub.teamId]?.[sub.taskId] === sub.submittedAt) {
        points = award;
      }
    }
    out.set(sub.id, points);
  }
  return out;
}
