import "server-only";
import { and, asc, count, desc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/lib/db";
import { auditLog, type Hunt, players, type SubmissionStatus, submissions, tasks, teams, users } from "@/lib/db/schema";
import { getStandings } from "@/lib/scoring/service";
import { filesFor } from "@/lib/storage";
import type { ActivityEntry } from "./activity";
import { SUBMISSIONS_PAGE_SIZE } from "./constants";
import { possessive } from "./labels";
import { thumbFor, toMediaFile } from "./media";
import { loadHistory, loadScoringContexts, toJudgeTask } from "./queue";
import type { HistoryEntry, JudgeTask, JudgeTeam, MediaFile } from "./types";
import type { TaskScoringContext } from "./what-if";

export const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "In review" },
  { key: "approved", label: "Accepted" },
  { key: "rejected", label: "Not accepted" },
] as const;

export type StatusTab = (typeof STATUS_TABS)[number]["key"];

export type SubmissionFilters = {
  status: StatusTab;
  task: string | null;
  team: string | null;
  q: string | null;
  page: number;
};

export type SubmissionRow = {
  id: string;
  status: SubmissionStatus;
  autoJudged: boolean;
  createdAt: number;
  judgedAt: number | null;
  judgedBy: string | null;
  text: string | null;
  feedback: string | null;
  contestValue: number | null;
  pointsOverride: number | null;
  thumb: string | null;
  fileCount: number;
  team: JudgeTeam;
  task: { id: string; code: number; title: string; kind: JudgeTask["kind"]; contestUnit: string | null };
  /** Points this submission earns: the team's award when it's their solve, null when it doesn't count. */
  points: number | null;
};

/** Escapes LIKE wildcards so a search for "100%" means the text 100%. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function filterConditions(huntId: string, f: Omit<SubmissionFilters, "status" | "page">): SQL[] {
  const where: SQL[] = [eq(submissions.huntId, huntId)];
  if (f.task) where.push(eq(submissions.taskId, f.task));
  if (f.team) where.push(eq(submissions.teamId, f.team));
  if (f.q) {
    const pattern = likePattern(f.q);
    const search = or(
      sql`${submissions.text} LIKE ${pattern} ESCAPE '\\'`,
      sql`${submissions.feedback} LIKE ${pattern} ESCAPE '\\'`,
    );
    if (search) where.push(search);
  }
  return where;
}

export async function loadSubmissionList(hunt: Pick<Hunt, "id">, filters: SubmissionFilters) {
  const judge = alias(users, "judge");
  const [taskRows, teamRows] = await Promise.all([
    db
      .select({ id: tasks.id, code: tasks.code, title: tasks.title })
      .from(tasks)
      .where(eq(tasks.huntId, hunt.id))
      .orderBy(asc(tasks.code)),
    db
      .select({ id: teams.id, name: teams.name, emoji: teams.emoji, color: teams.color, hidden: teams.hidden })
      .from(teams)
      .where(eq(teams.huntId, hunt.id))
      .orderBy(asc(teams.name)),
  ]);
  // A task or team from another hunt (or one deleted since the link was made) filters nothing.
  const f: SubmissionFilters = {
    ...filters,
    task: filters.task && taskRows.some((t) => t.id === filters.task) ? filters.task : null,
    team: filters.team && teamRows.some((t) => t.id === filters.team) ? filters.team : null,
  };
  const base = filterConditions(hunt.id, f);

  const statusCounts = await db
    .select({ status: submissions.status, n: count() })
    .from(submissions)
    .where(and(...base))
    .groupBy(submissions.status);

  const counts: Record<StatusTab, number> = { all: 0, pending: 0, approved: 0, rejected: 0 };
  for (const row of statusCounts) {
    counts[row.status] = row.n;
    counts.all += row.n;
  }
  const total = counts[f.status];
  const pages = Math.max(1, Math.ceil(total / SUBMISSIONS_PAGE_SIZE));
  const page = Math.min(Math.max(1, f.page), pages);

  const where = f.status === "all" ? and(...base) : and(...base, eq(submissions.status, f.status));
  const rows = await db
    .select({
      sub: submissions,
      judgeName: judge.name,
      team: { id: teams.id, name: teams.name, emoji: teams.emoji, color: teams.color, hidden: teams.hidden },
      task: {
        id: tasks.id,
        code: tasks.code,
        title: tasks.title,
        kind: tasks.kind,
        contestUnit: tasks.contestUnit,
      },
    })
    .from(submissions)
    .innerJoin(teams, eq(teams.id, submissions.teamId))
    .innerJoin(tasks, eq(tasks.id, submissions.taskId))
    .leftJoin(judge, eq(judge.id, submissions.judgedBy))
    .where(where)
    .orderBy(desc(submissions.createdAt), desc(submissions.id))
    .limit(SUBMISSIONS_PAGE_SIZE)
    .offset((page - 1) * SUBMISSIONS_PAGE_SIZE);

  const [fileMap, standings] = await Promise.all([
    filesFor(
      "submission",
      rows.map((r) => r.sub.id),
    ),
    getStandings(hunt.id),
  ]);

  const list: SubmissionRow[] = rows.map(({ sub, judgeName, team, task }) => {
    let points: number | null = null;
    if (sub.status === "approved" && task.kind !== "contest") {
      const solvedAt = standings.solvedAt[team.id]?.[task.id];
      if (solvedAt === sub.createdAt.getTime()) points = standings.awards[team.id]?.[task.id] ?? 0;
    }
    return {
      id: sub.id,
      status: sub.status,
      autoJudged: sub.autoJudged,
      createdAt: sub.createdAt.getTime(),
      judgedAt: sub.judgedAt?.getTime() ?? null,
      judgedBy: judgeName,
      text: sub.text,
      feedback: sub.feedback,
      contestValue: sub.contestValue,
      pointsOverride: sub.pointsOverride,
      thumb: thumbFor(fileMap[sub.id]),
      fileCount: fileMap[sub.id]?.length ?? 0,
      team,
      task,
      points,
    };
  });

  return { rows: list, counts, total, page, pages, tasks: taskRows, teams: teamRows, task: f.task, team: f.team };
}

export type AuditRow = ActivityEntry & {
  id: string;
  actorId: string | null;
  actorName: string | null;
  createdAt: number;
};

export type SubmissionDetail = {
  id: string;
  status: SubmissionStatus;
  autoJudged: boolean;
  createdAt: number;
  judgedAt: number | null;
  judgedBy: string | null;
  claim: { userId: string; name: string; at: number } | null;
  text: string | null;
  feedback: string | null;
  contestValue: number | null;
  pointsOverride: number | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  playerName: string | null;
  files: MediaFile[];
  task: JudgeTask;
  team: JudgeTeam;
  teams: Record<string, JudgeTeam>;
  history: HistoryEntry[];
  scoring: TaskScoringContext | null;
  /** What the team holds for this task right now. */
  award: number;
  /** Whether this submission is the one that counts for a standard task. */
  isSolve: boolean;
  /** Contest tasks: the team's place right now. */
  place: number | null;
  audit: AuditRow[];
};

export async function loadSubmissionDetail(
  hunt: Pick<Hunt, "id">,
  submissionId: string,
): Promise<SubmissionDetail | null> {
  const judge = alias(users, "judge");
  const claimer = alias(users, "claimer");
  const row = await db
    .select({
      sub: submissions,
      task: tasks,
      team: { id: teams.id, name: teams.name, emoji: teams.emoji, color: teams.color, hidden: teams.hidden },
      playerName: players.name,
      judgeName: judge.name,
      claimName: claimer.name,
    })
    .from(submissions)
    .innerJoin(tasks, eq(tasks.id, submissions.taskId))
    .innerJoin(teams, eq(teams.id, submissions.teamId))
    .leftJoin(players, eq(players.id, submissions.playerId))
    .leftJoin(judge, eq(judge.id, submissions.judgedBy))
    .leftJoin(claimer, eq(claimer.id, submissions.claimedBy))
    .where(and(eq(submissions.id, submissionId), eq(submissions.huntId, hunt.id)))
    .get();
  if (!row) return null;
  const { sub, task, team } = row;

  const actor = alias(users, "actor");
  const [fileMap, history, teamRows, auditRows, standings] = await Promise.all([
    filesFor("submission", [sub.id]),
    loadHistory(hunt.id, [{ teamId: team.id, taskId: task.id }]),
    db
      .select({ id: teams.id, name: teams.name, emoji: teams.emoji, color: teams.color, hidden: teams.hidden })
      .from(teams)
      .where(eq(teams.huntId, hunt.id)),
    db
      .select({ entry: auditLog, actorName: actor.name })
      .from(auditLog)
      .leftJoin(actor, eq(actor.id, auditLog.actorUserId))
      .where(and(eq(auditLog.huntId, hunt.id), eq(auditLog.targetKind, "submission"), eq(auditLog.targetId, sub.id)))
      .orderBy(desc(auditLog.createdAt))
      .limit(50),
    getStandings(hunt.id),
  ]);
  const scoring = (await loadScoringContexts(hunt.id, [task], teamRows))[task.id] ?? null;

  const contestEntry = standings.tasks[task.id]?.contest?.find((e) => e.teamId === team.id);
  return {
    id: sub.id,
    status: sub.status,
    autoJudged: sub.autoJudged,
    createdAt: sub.createdAt.getTime(),
    judgedAt: sub.judgedAt?.getTime() ?? null,
    judgedBy: row.judgeName,
    claim:
      sub.claimedBy && sub.claimedAt
        ? { userId: sub.claimedBy, name: row.claimName ?? "Another judge", at: sub.claimedAt.getTime() }
        : null,
    text: sub.text,
    feedback: sub.feedback,
    contestValue: sub.contestValue,
    pointsOverride: sub.pointsOverride,
    lat: sub.lat,
    lng: sub.lng,
    accuracy: sub.accuracy,
    playerName: row.playerName,
    files: (fileMap[sub.id] ?? []).map(toMediaFile),
    task: toJudgeTask(task),
    team,
    teams: Object.fromEntries(teamRows.map((t) => [t.id, t])),
    history: (history.get(`${team.id}:${task.id}`) ?? []).filter((h) => h.id !== sub.id),
    scoring,
    award: standings.awards[team.id]?.[task.id] ?? 0,
    isSolve: standings.solvedAt[team.id]?.[task.id] === sub.createdAt.getTime(),
    place: contestEntry?.place ?? null,
    audit: auditRows.map(({ entry, actorName }) => ({
      id: entry.id,
      action: entry.action,
      targetKind: entry.targetKind,
      targetId: entry.targetId,
      data: entry.data ?? null,
      actorId: entry.actorUserId,
      actorName,
      createdAt: entry.createdAt.getTime(),
    })),
  };
}

/** Exists for "does this id belong to the hunt" checks without loading everything. */
export async function submissionIdsExist(huntId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.huntId, huntId), inArray(submissions.id, ids)));
  return new Set(rows.map((r) => r.id));
}

/** "Night Owls’ submission for 31 The red door", from the audit entry of a deletion in this hunt. */
export async function deletedSubmissionLabel(huntId: string, submissionId: string): Promise<string | null> {
  const entry = await db
    .select({ data: auditLog.data })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.huntId, huntId),
        eq(auditLog.action, "submission.delete"),
        eq(auditLog.targetKind, "submission"),
        eq(auditLog.targetId, submissionId),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .get();
  const data = entry?.data;
  if (!data) return null;
  const team = typeof data.teamName === "string" ? data.teamName : "a team";
  const code = typeof data.taskCode === "number" ? `${data.taskCode} ` : "";
  const title = typeof data.taskTitle === "string" ? data.taskTitle : "a task";
  return `${possessive(team)} submission for ${code}${title}`;
}

/** "Night Owls: 31 The red door", for the page title. */
export async function submissionTitle(huntId: string, submissionId: string): Promise<string | null> {
  const row = await db
    .select({ teamName: teams.name, code: tasks.code, title: tasks.title })
    .from(submissions)
    .innerJoin(teams, eq(teams.id, submissions.teamId))
    .innerJoin(tasks, eq(tasks.id, submissions.taskId))
    .where(and(eq(submissions.id, submissionId), eq(submissions.huntId, huntId)))
    .get();
  return row ? `${row.teamName}: ${row.code} ${row.title}` : null;
}
