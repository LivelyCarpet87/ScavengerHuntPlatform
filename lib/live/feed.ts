import "server-only";
import { and, desc, eq, isNull, lte, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { announcements, type Hunt, submissions, tasks, teams } from "@/lib/db/schema";
import { canViewGallery, type ScoreboardViewer, scoreboardCutoff } from "@/lib/hunts";
import { getStandings } from "@/lib/scoring/service";
import { mediaForSubmissions } from "./media";
import { pointsForSubmissions } from "./shape";
import type { FeedAnnouncement, FeedItem, FeedPayload, FeedPunch } from "./types";
import { visibleToPlayers } from "./viewer";

type FeedHunt = Pick<
  Hunt,
  "id" | "status" | "startsAt" | "endsAt" | "freezeAt" | "galleryMode" | "scoreboardVisibility"
>;

export const FEED_DEFAULT_LIMIT = 30;
export const FEED_MAX_LIMIT = 100;

/**
 * Recent accepted submissions and announcements, newest first.
 *
 * Non-staff viewers get nothing that happened after the scoreboard freeze
 * (score events must not leak through the ticker), never see hidden teams or
 * tasks players can't see yet, and only get media URLs when the gallery is
 * open to them.
 * Announcements are not score events: they are already on every player's
 * phone, so they stay in the feed during a freeze.
 *
 * Access to the scoreboard must be checked by the caller.
 */
export async function loadFeed(
  hunt: FeedHunt,
  viewer: ScoreboardViewer,
  opts: { limit?: number; now?: Date } = {},
): Promise<FeedPayload> {
  const now = opts.now ?? new Date();
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? FEED_DEFAULT_LIMIT)), FEED_MAX_LIMIT);
  const cutoff = scoreboardCutoff(hunt, viewer, now);
  const galleryOpen = canViewGallery(hunt, viewer, now);
  const acceptedAt = sql<number>`coalesce(${submissions.judgedAt}, ${submissions.createdAt})`;

  const filters: SQL[] = [eq(submissions.huntId, hunt.id), eq(submissions.status, "approved")];
  if (!viewer.isStaff) filters.push(...visibleToPlayers(now));
  if (cutoff) {
    filters.push(lte(submissions.createdAt, cutoff));
    const judgedBy = or(isNull(submissions.judgedAt), lte(submissions.judgedAt, cutoff));
    if (judgedBy) filters.push(judgedBy);
  }

  const [subRows, annRows, standings] = await Promise.all([
    db
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
      .orderBy(desc(acceptedAt), desc(submissions.id))
      .limit(limit),
    db
      .select({
        id: announcements.id,
        title: announcements.title,
        body: announcements.body,
        createdAt: announcements.createdAt,
      })
      .from(announcements)
      .where(eq(announcements.huntId, hunt.id))
      .orderBy(desc(announcements.createdAt))
      .limit(limit),
    getStandings(hunt.id, { cutoff }),
  ]);

  const media = galleryOpen ? await mediaForSubmissions(subRows.map((r) => r.id)) : {};

  const points = pointsForSubmissions(
    subRows.map((row) => ({
      id: row.id,
      teamId: row.teamId,
      taskId: row.taskId,
      taskKind: row.taskKind,
      submittedAt: row.createdAt.getTime(),
    })),
    standings,
  );
  const punches: FeedPunch[] = subRows.map((row) => ({
    kind: "punch",
    id: row.id,
    at: (row.judgedAt ?? row.createdAt).toISOString(),
    team: { id: row.teamId, name: row.teamName, emoji: row.teamEmoji, color: row.teamColor },
    task: { id: row.taskId, code: row.taskCode, title: row.taskTitle, kind: row.taskKind },
    points: points.get(row.id) ?? null,
    media: media[row.id] ?? [],
  }));

  const notes: FeedAnnouncement[] = annRows.map((a) => ({
    kind: "announcement",
    id: a.id,
    at: a.createdAt.toISOString(),
    title: a.title,
    body: a.body,
  }));

  const items: FeedItem[] = [...punches, ...notes]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1))
    .slice(0, limit);

  return { items, galleryOpen, frozenAt: cutoff ? cutoff.toISOString() : null };
}
