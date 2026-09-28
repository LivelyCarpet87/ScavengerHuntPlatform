import "server-only";
import { and, asc, count, desc, eq, inArray, isNotNull, min, ne, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/lib/db";
import {
  type Hunt,
  players,
  submissions,
  TASK_KINDS,
  type Task,
  type TaskKind,
  tasks,
  teams,
  users,
} from "@/lib/db/schema";
import type { EngineSubmission, EngineTask } from "@/lib/scoring/engine";
import { getStandings } from "@/lib/scoring/service";
import { filesFor } from "@/lib/storage";
import { describeScoring, kindLabel } from "@/lib/tasks";
import { QUEUE_MAX, QUEUE_PAGE_SIZE } from "./constants";
import { thumbFor, toMediaFile } from "./media";
import type {
  HistoryEntry,
  JudgeQueueData,
  JudgeTask,
  QueueCounts,
  QueueItem,
  QueueQuery,
  RecentDecision,
} from "./types";
import { type CompactScoring, compactScoring, needsContestValue, type TaskScoringContext } from "./what-if";

export function toJudgeTask(task: Task): JudgeTask {
  return {
    id: task.id,
    code: task.code,
    title: task.title,
    kind: task.kind,
    kindLabel: kindLabel(task),
    category: task.category,
    answers: task.answers,
    answerMatch: task.answerMatch,
    scoringText: describeScoring(task),
    scoring: task.scoring,
    contestUnit: task.contestUnit,
    contestRank: task.contestRank,
    contestPlaces: task.contestPlaces,
    needsValue: needsContestValue(task),
    autoApprove: task.autoApprove,
    hidden: task.hidden,
  };
}

function toEngineTask(task: Task): EngineTask {
  return {
    id: task.id,
    kind: task.kind,
    scoring: task.scoring,
    points: task.points,
    minPoints: task.minPoints,
    decaySolves: task.decaySolves,
    contestRank: task.contestRank,
    contestPlaces: task.contestPlaces,
  };
}

/** Accepted submissions for the given tasks, grouped by task. */
async function loadApproved(huntId: string, taskIds: string[]): Promise<Map<string, EngineSubmission[]>> {
  const out = new Map<string, EngineSubmission[]>();
  if (taskIds.length === 0) return out;
  const rows = await db
    .select({
      id: submissions.id,
      taskId: submissions.taskId,
      teamId: submissions.teamId,
      createdAt: submissions.createdAt,
      judgedAt: submissions.judgedAt,
      pointsOverride: submissions.pointsOverride,
      contestValue: submissions.contestValue,
    })
    .from(submissions)
    .where(
      and(eq(submissions.huntId, huntId), eq(submissions.status, "approved"), inArray(submissions.taskId, taskIds)),
    );
  for (const s of rows) {
    const list = out.get(s.taskId) ?? [];
    list.push({
      id: s.id,
      taskId: s.taskId,
      teamId: s.teamId,
      status: "approved",
      submittedAt: s.createdAt.getTime(),
      judgedAt: s.judgedAt?.getTime() ?? null,
      pointsOverride: s.pointsOverride,
      contestValue: s.contestValue,
    });
    out.set(s.taskId, list);
  }
  return out;
}

/** Full scoring contexts (every accepted submission) for re-judging on a submission's page. */
export async function loadScoringContexts(
  huntId: string,
  taskRows: Task[],
  teamRows: { id: string; name: string; hidden: boolean }[],
): Promise<Record<string, TaskScoringContext>> {
  if (taskRows.length === 0) return {};
  const approved = await loadApproved(
    huntId,
    taskRows.map((t) => t.id),
  );
  const engineTeams = teamRows.map((t) => ({ id: t.id, name: t.name, hidden: t.hidden }));
  return Object.fromEntries(
    taskRows.map((task) => [
      task.id,
      { task: toEngineTask(task), teams: engineTeams, approved: approved.get(task.id) ?? [] },
    ]),
  );
}

/**
 * Compact scoring rows (see compactScoring) for the tasks of the loaded queue
 * items: what approving any of them would be worth, without sending every
 * accepted submission on each refresh.
 */
async function loadQueueScoring(
  huntId: string,
  taskRows: Task[],
  items: { taskId: string; teamId: string }[],
): Promise<Record<string, CompactScoring>> {
  const reviewing = new Map<string, Set<string>>();
  for (const i of items) {
    const set = reviewing.get(i.taskId) ?? new Set<string>();
    set.add(i.teamId);
    reviewing.set(i.taskId, set);
  }
  const wanted = taskRows.filter((t) => reviewing.has(t.id));
  const approved = await loadApproved(
    huntId,
    wanted.map((t) => t.id),
  );
  return Object.fromEntries(
    wanted.map((task) => [
      task.id,
      compactScoring(toEngineTask(task), approved.get(task.id) ?? [], reviewing.get(task.id) ?? new Set()),
    ]),
  );
}

/**
 * The team's other submissions for the same tasks, newest first, keyed by
 * `${teamId}:${taskId}`.
 */
export async function loadHistory(
  huntId: string,
  pairs: { teamId: string; taskId: string }[],
): Promise<Map<string, HistoryEntry[]>> {
  const out = new Map<string, HistoryEntry[]>();
  if (pairs.length === 0) return out;
  const wanted = new Set(pairs.map((p) => `${p.teamId}:${p.taskId}`));
  const judge = alias(users, "judge");
  const rows = await db
    .select({ sub: submissions, judgeName: judge.name })
    .from(submissions)
    .leftJoin(judge, eq(judge.id, submissions.judgedBy))
    .where(
      and(
        eq(submissions.huntId, huntId),
        inArray(submissions.taskId, [...new Set(pairs.map((p) => p.taskId))]),
        inArray(submissions.teamId, [...new Set(pairs.map((p) => p.teamId))]),
      ),
    )
    .orderBy(desc(submissions.createdAt));
  const relevant = rows.filter((r) => wanted.has(`${r.sub.teamId}:${r.sub.taskId}`));
  const fileMap = await filesFor(
    "submission",
    relevant.map((r) => r.sub.id),
  );
  for (const { sub, judgeName } of relevant) {
    const key = `${sub.teamId}:${sub.taskId}`;
    const list = out.get(key) ?? [];
    list.push({
      id: sub.id,
      status: sub.status,
      autoJudged: sub.autoJudged,
      createdAt: sub.createdAt.getTime(),
      judgedAt: sub.judgedAt?.getTime() ?? null,
      judgedBy: judgeName ?? null,
      text: sub.text,
      feedback: sub.feedback,
      contestValue: sub.contestValue,
      pointsOverride: sub.pointsOverride,
      thumb: thumbFor(fileMap[sub.id]),
    });
    out.set(key, list);
  }
  return out;
}

export type QueueParams = {
  task?: string | null;
  team?: string | null;
  kind?: string | null;
  /** The submission open in the URL: loaded even when it's past the page or filtered out. */
  id?: string | null;
  limit?: number | null;
};

/**
 * One page of the judging queue: the oldest waiting submissions matching the
 * filters (plus the one open in the URL) with what judging them needs, and
 * counts over the whole queue. `descriptions` holds the raw Markdown of the
 * loaded tasks for the page to render on the server.
 */
export async function loadJudgeQueue(
  hunt: Pick<Hunt, "id">,
  viewerId: string,
  params: QueueParams = {},
): Promise<{ data: JudgeQueueData; descriptions: Record<string, string> }> {
  const [taskRows, teamRows, groups] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.huntId, hunt.id)).orderBy(asc(tasks.code)),
    db
      .select({ id: teams.id, name: teams.name, emoji: teams.emoji, color: teams.color, hidden: teams.hidden })
      .from(teams)
      .where(eq(teams.huntId, hunt.id))
      .orderBy(asc(teams.name)),
    db
      .select({
        taskId: submissions.taskId,
        teamId: submissions.teamId,
        n: count(),
        oldest: min(submissions.createdAt),
      })
      .from(submissions)
      .where(and(eq(submissions.huntId, hunt.id), eq(submissions.status, "pending")))
      .groupBy(submissions.taskId, submissions.teamId),
  ]);

  // Filters from the URL count only when they name something in this hunt.
  const taskById = new Map(taskRows.map((t) => [t.id, t]));
  const query: QueueQuery = {
    task: params.task && taskById.has(params.task) ? params.task : null,
    team: params.team && teamRows.some((t) => t.id === params.team) ? params.team : null,
    kind: params.kind && (TASK_KINDS as readonly string[]).includes(params.kind) ? (params.kind as TaskKind) : null,
    limit: Math.min(QUEUE_MAX, Math.max(QUEUE_PAGE_SIZE, Math.floor(params.limit ?? QUEUE_PAGE_SIZE) || 0)),
  };
  const matches = (taskId: string, teamId: string) =>
    (!query.task || taskId === query.task) &&
    (!query.team || teamId === query.team) &&
    (!query.kind || taskById.get(taskId)?.kind === query.kind);

  const counts: QueueCounts = { total: 0, oldestAt: null, byTask: {}, byTeam: {}, byKind: {}, matching: 0 };
  for (const g of groups) {
    counts.total += g.n;
    counts.byTask[g.taskId] = (counts.byTask[g.taskId] ?? 0) + g.n;
    counts.byTeam[g.teamId] = (counts.byTeam[g.teamId] ?? 0) + g.n;
    const kind = taskById.get(g.taskId)?.kind;
    if (kind) counts.byKind[kind] = (counts.byKind[kind] ?? 0) + g.n;
    if (matches(g.taskId, g.teamId)) counts.matching += g.n;
    const oldest = g.oldest?.getTime() ?? null;
    if (oldest != null && (counts.oldestAt == null || oldest < counts.oldestAt)) counts.oldestAt = oldest;
  }

  const where: SQL[] = [eq(submissions.huntId, hunt.id), eq(submissions.status, "pending")];
  if (query.task) where.push(eq(submissions.taskId, query.task));
  if (query.team) where.push(eq(submissions.teamId, query.team));
  if (query.kind) {
    const ofKind = taskRows.filter((t) => t.kind === query.kind).map((t) => t.id);
    where.push(ofKind.length > 0 ? inArray(submissions.taskId, ofKind) : eq(submissions.id, ""));
  }
  const claimer = alias(users, "claimer");
  const pendingQuery = (conditions: SQL[], limit: number) =>
    db
      .select({ sub: submissions, playerName: players.name, claimName: claimer.name })
      .from(submissions)
      .leftJoin(players, eq(players.id, submissions.playerId))
      .leftJoin(claimer, eq(claimer.id, submissions.claimedBy))
      .where(and(...conditions))
      .orderBy(asc(submissions.createdAt), asc(submissions.id))
      .limit(limit);

  const judge = alias(users, "judge");
  const [pageRows, recentRows] = await Promise.all([
    pendingQuery(where, query.limit),
    db
      .select({ sub: submissions, judgeName: judge.name })
      .from(submissions)
      .innerJoin(judge, eq(judge.id, submissions.judgedBy))
      .where(and(eq(submissions.huntId, hunt.id), ne(submissions.status, "pending"), isNotNull(submissions.judgedAt)))
      .orderBy(desc(submissions.judgedAt))
      .limit(10),
  ]);
  const pendingRows = [...pageRows];
  if (params.id && params.id.length <= 64 && !pageRows.some((r) => r.sub.id === params.id)) {
    const open = await pendingQuery(
      [eq(submissions.huntId, hunt.id), eq(submissions.status, "pending"), eq(submissions.id, params.id)],
      1,
    );
    pendingRows.push(...open);
    pendingRows.sort((a, b) => a.sub.createdAt.getTime() - b.sub.createdAt.getTime() || (a.sub.id < b.sub.id ? -1 : 1));
  }

  const [fileMap, recentFiles, history, scoring, standings] = await Promise.all([
    filesFor(
      "submission",
      pendingRows.map((r) => r.sub.id),
    ),
    filesFor(
      "submission",
      recentRows.map((r) => r.sub.id),
    ),
    loadHistory(
      hunt.id,
      pendingRows.map((r) => ({ teamId: r.sub.teamId, taskId: r.sub.taskId })),
    ),
    loadQueueScoring(
      hunt.id,
      taskRows,
      pendingRows.map((r) => r.sub),
    ),
    getStandings(hunt.id),
  ]);

  const items: QueueItem[] = pendingRows.map(({ sub, playerName, claimName }) => ({
    id: sub.id,
    taskId: sub.taskId,
    teamId: sub.teamId,
    playerName,
    text: sub.text,
    createdAt: sub.createdAt.getTime(),
    lat: sub.lat,
    lng: sub.lng,
    accuracy: sub.accuracy,
    files: (fileMap[sub.id] ?? []).map(toMediaFile),
    claim:
      sub.claimedBy && sub.claimedAt
        ? { userId: sub.claimedBy, name: claimName ?? "Another judge", at: sub.claimedAt.getTime() }
        : null,
    history: (history.get(`${sub.teamId}:${sub.taskId}`) ?? []).filter((h) => h.id !== sub.id),
  }));

  const recent: RecentDecision[] = recentRows.map(({ sub, judgeName }) => ({
    id: sub.id,
    status: sub.status,
    teamId: sub.teamId,
    taskId: sub.taskId,
    judgedAt: sub.judgedAt?.getTime() ?? 0,
    judgedBy: judgeName,
    byMe: sub.judgedBy === viewerId,
    feedback: sub.feedback,
    points: standings.awards[sub.teamId]?.[sub.taskId] ?? 0,
    thumb: thumbFor(recentFiles[sub.id]),
  }));

  // Descriptions only for the loaded submissions' tasks: the rest would ride along on every refresh for nothing.
  const descriptions: Record<string, string> = {};
  for (const id of new Set(items.map((i) => i.taskId))) {
    const description = taskById.get(id)?.description.trim();
    if (description) descriptions[id] = description;
  }

  return {
    data: {
      items,
      counts,
      query,
      openId: params.id ?? null,
      tasks: Object.fromEntries(taskRows.map((t) => [t.id, toJudgeTask(t)])),
      teams: Object.fromEntries(teamRows.map((t) => [t.id, t])),
      scoring,
      recent,
    },
    descriptions,
  };
}
