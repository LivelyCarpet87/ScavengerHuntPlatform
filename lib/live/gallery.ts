import "server-only";
import { and, asc, eq, isNull, lte, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { type Hunt, submissions, tasks, teams } from "@/lib/db/schema";
import { type ScoreboardViewer, scoreboardCutoff } from "@/lib/hunts";
import { mediaForSubmissions } from "./media";
import type { GalleryItem } from "./types";
import { visibleToPlayers } from "./viewer";

type GalleryHunt = Pick<Hunt, "id" | "status" | "startsAt" | "endsAt" | "freezeAt">;

/**
 * Photos and videos of accepted submissions, ordered by task (as organized
 * by the organizers), then by the time they were accepted.
 *
 * - `onlyTeamId` limits the result to one team (the "Just my team" filter,
 *   and what a player sees of their own team while the gallery is closed).
 * - Non-staff never see tasks players can't see yet or hidden teams (their own team
 *   excepted, e.g. a staff test run looking at its own photos), and other teams'
 *   photos accepted after the scoreboard freeze stay hidden until the end
 *   (a new photo would give away a score). Their own team's are never held back.
 *
 * Gallery access must be checked by the caller.
 */
export async function loadGallery(
  hunt: GalleryHunt,
  viewer: ScoreboardViewer & { teamId: string | null },
  opts: { onlyTeamId?: string | null; now?: Date } = {},
): Promise<GalleryItem[]> {
  const now = opts.now ?? new Date();
  const cutoff = scoreboardCutoff(hunt, viewer, now);
  const filters: SQL[] = [eq(submissions.huntId, hunt.id), eq(submissions.status, "approved")];
  if (opts.onlyTeamId) filters.push(eq(submissions.teamId, opts.onlyTeamId));
  if (!viewer.isStaff) filters.push(...visibleToPlayers(now, viewer.teamId));
  if (cutoff) {
    const beforeFreeze = and(
      lte(submissions.createdAt, cutoff),
      or(isNull(submissions.judgedAt), lte(submissions.judgedAt, cutoff)),
    );
    const visible = viewer.teamId ? or(eq(submissions.teamId, viewer.teamId), beforeFreeze) : beforeFreeze;
    if (visible) filters.push(visible);
  }

  const rows = await db
    .select({
      id: submissions.id,
      createdAt: submissions.createdAt,
      judgedAt: submissions.judgedAt,
      teamId: teams.id,
      teamName: teams.name,
      teamEmoji: teams.emoji,
      teamColor: teams.color,
      taskId: tasks.id,
      taskCode: tasks.code,
      taskTitle: tasks.title,
      taskKind: tasks.kind,
    })
    .from(submissions)
    .innerJoin(teams, and(eq(teams.id, submissions.teamId), eq(teams.huntId, hunt.id)))
    .innerJoin(tasks, and(eq(tasks.id, submissions.taskId), eq(tasks.huntId, hunt.id)))
    .where(and(...filters))
    .orderBy(
      asc(tasks.sortOrder),
      asc(tasks.code),
      asc(sql`coalesce(${submissions.judgedAt}, ${submissions.createdAt})`),
      asc(submissions.id),
    );

  const media = await mediaForSubmissions(rows.map((r) => r.id));
  const items: GalleryItem[] = [];
  for (const row of rows) {
    for (const m of media[row.id] ?? []) {
      items.push({
        ...m,
        submissionId: row.id,
        at: (row.judgedAt ?? row.createdAt).toISOString(),
        team: { id: row.teamId, name: row.teamName, emoji: row.teamEmoji, color: row.teamColor },
        task: { id: row.taskId, code: row.taskCode, title: row.taskTitle, kind: row.taskKind },
      });
    }
  }
  return items;
}
