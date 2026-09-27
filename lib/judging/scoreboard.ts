import "server-only";
import { and, asc, count, desc, eq, sum } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/lib/db";
import {
  adjustments,
  files,
  type Hunt,
  hints,
  hintUnlocks,
  submissions,
  type Task,
  tasks,
  teams,
  users,
} from "@/lib/db/schema";
import { scoreboardCutoff } from "@/lib/hunts";
import { getStandings, type Standings } from "@/lib/scoring/service";

export type AdjustmentRow = {
  id: string;
  teamId: string;
  points: number;
  reason: string;
  createdAt: number;
  createdBy: string | null;
};

export type HintRow = { teamId: string; taskId: string; cost: number; createdAt: number };

export type StaffScoreboard = {
  standings: Standings;
  /** What players see while the scoreboard is frozen; null when they see live scores. */
  frozen: Standings | null;
  cutoff: Date | null;
  tasks: Task[];
  adjustments: AdjustmentRow[];
  hints: HintRow[];
  pendingByTask: Record<string, number>;
  media: { files: number; bytes: number; byTask: Record<string, { files: number; bytes: number }> };
};

export async function loadStaffScoreboard(hunt: Hunt): Promise<StaffScoreboard> {
  const cutoff = scoreboardCutoff(hunt, { isStaff: false, isPlayer: true });
  const creator = alias(users, "creator");
  const [standings, frozen, taskRows, adjustmentRows, hintRows, pendingRows, mediaRows] = await Promise.all([
    getStandings(hunt.id),
    cutoff ? getStandings(hunt.id, { cutoff }) : Promise.resolve(null),
    db.select().from(tasks).where(eq(tasks.huntId, hunt.id)).orderBy(asc(tasks.code)),
    db
      .select({ adjustment: adjustments, creatorName: creator.name })
      .from(adjustments)
      .leftJoin(creator, eq(creator.id, adjustments.createdBy))
      .where(eq(adjustments.huntId, hunt.id))
      .orderBy(desc(adjustments.createdAt)),
    db
      .select({
        teamId: hintUnlocks.teamId,
        taskId: hints.taskId,
        cost: hintUnlocks.cost,
        createdAt: hintUnlocks.createdAt,
      })
      .from(hintUnlocks)
      .innerJoin(hints, eq(hints.id, hintUnlocks.hintId))
      .where(eq(hintUnlocks.huntId, hunt.id))
      .orderBy(asc(hintUnlocks.createdAt)),
    db
      .select({ taskId: submissions.taskId, n: count() })
      .from(submissions)
      .where(and(eq(submissions.huntId, hunt.id), eq(submissions.status, "pending")))
      .groupBy(submissions.taskId),
    db
      .select({ taskId: submissions.taskId, n: count(files.id), bytes: sum(files.size) })
      .from(files)
      .innerJoin(submissions, eq(submissions.id, files.ownerId))
      .where(
        and(
          eq(files.huntId, hunt.id),
          eq(files.ownerKind, "submission"),
          eq(submissions.huntId, hunt.id),
          eq(submissions.status, "approved"),
        ),
      )
      .groupBy(submissions.taskId),
  ]);

  const byTask: Record<string, { files: number; bytes: number }> = {};
  let mediaFiles = 0;
  let mediaBytes = 0;
  for (const row of mediaRows) {
    const bytes = Number(row.bytes ?? 0);
    byTask[row.taskId] = { files: row.n, bytes };
    mediaFiles += row.n;
    mediaBytes += bytes;
  }

  return {
    standings,
    frozen,
    cutoff,
    tasks: taskRows,
    adjustments: adjustmentRows.map(({ adjustment, creatorName }) => ({
      id: adjustment.id,
      teamId: adjustment.teamId,
      points: adjustment.points,
      reason: adjustment.reason,
      createdAt: adjustment.createdAt.getTime(),
      createdBy: creatorName,
    })),
    hints: hintRows.map((h) => ({ ...h, createdAt: h.createdAt.getTime() })),
    pendingByTask: Object.fromEntries(pendingRows.map((r) => [r.taskId, r.n])),
    media: { files: mediaFiles, bytes: mediaBytes, byTask },
  };
}

/** Team rows with display fields, for forms and lists. */
export async function loadTeams(huntId: string) {
  return db
    .select({ id: teams.id, name: teams.name, emoji: teams.emoji, color: teams.color, hidden: teams.hidden })
    .from(teams)
    .where(eq(teams.huntId, huntId))
    .orderBy(asc(teams.name));
}
