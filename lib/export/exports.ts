import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/lib/db";
import { files, type Hunt, players, submissions, tasks, teams, users } from "@/lib/db/schema";
import { getStandings } from "@/lib/scoring/service";
import { fileUrl, variantPath } from "@/lib/storage";
import { toCsv } from "./csv";
import { mediaEntryNames } from "./names";
import type { ZipSource } from "./zip";

/*
 * Builders for the hunt exports served by
 * app/api/hunts/[huntId]/export/[kind]/route.ts. Scores are always live
 * (staff exports ignore the scoreboard freeze).
 */

const STATUS_WORDS = { pending: "In review", approved: "Accepted", rejected: "Not accepted" } as const;

/** rank, team, total, task points, contest points, hint penalty, adjustments, solved, last scored at, hidden */
export async function standingsCsv(hunt: Pick<Hunt, "id">): Promise<string> {
  const standings = await getStandings(hunt.id);
  return toCsv(
    [
      "rank",
      "team",
      "total",
      "task points",
      "contest points",
      "hint penalty",
      "adjustments",
      "solved",
      "last scored at",
      "hidden",
    ],
    standings.standings.map((s) => [
      s.rank,
      standings.teams[s.teamId]?.name ?? s.name,
      s.total,
      s.taskPoints,
      s.contestPoints,
      s.hintPenalty === 0 ? 0 : -s.hintPenalty,
      s.adjustmentPoints,
      s.solved,
      s.lastScoredAt != null ? new Date(s.lastScoredAt) : null,
      s.hidden,
    ]),
  );
}

/** One row per submission, oldest first, with absolute links to the original files. */
export async function submissionsCsv(hunt: Pick<Hunt, "id">, origin: string): Promise<string> {
  const judge = alias(users, "judge");
  const rows = await db
    .select({
      sub: submissions,
      teamName: teams.name,
      taskCode: tasks.code,
      taskTitle: tasks.title,
      judgeName: judge.name,
      playerName: players.name,
    })
    .from(submissions)
    .innerJoin(teams, eq(teams.id, submissions.teamId))
    .innerJoin(tasks, eq(tasks.id, submissions.taskId))
    .leftJoin(judge, eq(judge.id, submissions.judgedBy))
    .leftJoin(players, eq(players.id, submissions.playerId))
    .where(eq(submissions.huntId, hunt.id))
    .orderBy(asc(submissions.createdAt), asc(submissions.id));

  const fileRows = rows.length
    ? await db
        .select({ id: files.id, ownerId: files.ownerId, variants: files.variants, sortOrder: files.sortOrder })
        .from(files)
        .where(and(eq(files.huntId, hunt.id), eq(files.ownerKind, "submission")))
        .orderBy(asc(files.sortOrder), asc(files.createdAt))
    : [];
  const urls = new Map<string, string[]>();
  for (const f of fileRows) {
    const list = urls.get(f.ownerId) ?? [];
    list.push(`${origin}${fileUrl(f, "original")}`);
    urls.set(f.ownerId, list);
  }

  return toCsv(
    [
      "id",
      "submitted at",
      "team",
      "sent by",
      "task code",
      "task title",
      "status",
      "auto judged",
      "points override",
      "contest value",
      "text",
      "feedback",
      "judged by",
      "judged at",
      "file urls",
    ],
    rows.map(({ sub, teamName, taskCode, taskTitle, judgeName, playerName }) => [
      sub.id,
      sub.createdAt,
      teamName,
      playerName,
      taskCode,
      taskTitle,
      STATUS_WORDS[sub.status],
      sub.autoJudged,
      sub.pointsOverride,
      sub.contestValue,
      sub.text,
      sub.feedback,
      sub.autoJudged ? "automatic" : judgeName,
      sub.judgedAt,
      (urls.get(sub.id) ?? []).join(" "),
    ]),
  );
}

/** team, code, members, hidden, score — alphabetical. */
export async function teamsCsv(hunt: Pick<Hunt, "id">): Promise<string> {
  const [teamRows, playerRows, standings] = await Promise.all([
    db.select().from(teams).where(eq(teams.huntId, hunt.id)).orderBy(asc(teams.name)),
    db
      .select({ teamId: players.teamId, name: players.name, isCaptain: players.isCaptain })
      .from(players)
      .where(eq(players.huntId, hunt.id))
      .orderBy(asc(players.createdAt)),
    getStandings(hunt.id),
  ]);
  const members = new Map<string, string[]>();
  for (const p of playerRows) {
    const list = members.get(p.teamId) ?? [];
    if (p.isCaptain) list.unshift(`${p.name} (captain)`);
    else list.push(p.name);
    members.set(p.teamId, list);
  }
  const totals = new Map(standings.standings.map((s) => [s.teamId, s.total]));
  return toCsv(
    ["team", "code", "members", "hidden", "score"],
    teamRows.map((t) => [t.name, t.code, (members.get(t.id) ?? []).join(", "), t.hidden, totals.get(t.id) ?? 0]),
  );
}

/**
 * Original files of accepted submissions (optionally for one task), named
 * `<code>-<task>/<team>-<n>.<ext>`, in task-code, team-name and time order.
 */
export async function mediaSources(hunt: Pick<Hunt, "id">, taskId?: string | null): Promise<ZipSource[]> {
  const where = [eq(submissions.huntId, hunt.id), eq(submissions.status, "approved")];
  if (taskId) where.push(eq(submissions.taskId, taskId));
  const subs = await db
    .select({
      id: submissions.id,
      createdAt: submissions.createdAt,
      teamId: teams.id,
      teamName: teams.name,
      taskId: tasks.id,
      taskCode: tasks.code,
      taskTitle: tasks.title,
    })
    .from(submissions)
    .innerJoin(teams, eq(teams.id, submissions.teamId))
    .innerJoin(tasks, eq(tasks.id, submissions.taskId))
    .where(and(...where))
    .orderBy(asc(tasks.code), asc(teams.name), asc(submissions.createdAt));
  if (subs.length === 0) return [];

  const fileRows = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.huntId, hunt.id),
        eq(files.ownerKind, "submission"),
        inArray(
          files.ownerId,
          subs.map((s) => s.id),
        ),
      ),
    )
    .orderBy(asc(files.sortOrder), asc(files.createdAt));
  const byOwner = new Map<string, typeof fileRows>();
  for (const f of fileRows) {
    const list = byOwner.get(f.ownerId) ?? [];
    list.push(f);
    byOwner.set(f.ownerId, list);
  }

  const ordered = subs.flatMap((s) => (byOwner.get(s.id) ?? []).map((file) => ({ s, file })));
  const names = mediaEntryNames(
    ordered.map(({ s, file }) => ({
      taskId: s.taskId,
      taskCode: s.taskCode,
      taskTitle: s.taskTitle,
      teamId: s.teamId,
      teamName: s.teamName,
      ext: file.ext,
    })),
  );
  return ordered.map(({ s, file }, i) => ({
    name: names[i],
    path: variantPath(file, "original"),
    mtime: s.createdAt,
  }));
}
