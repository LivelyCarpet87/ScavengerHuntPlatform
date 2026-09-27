import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/lib/db";
import { type Hunt, players, submissions, type Task, tasks, teams, users } from "@/lib/db/schema";
import type { EngineSubmission } from "@/lib/scoring/engine";
import { getStandings } from "@/lib/scoring/service";
import { filesFor } from "@/lib/storage";
import { describeScoring, kindLabel } from "@/lib/tasks";
import { thumbFor, toMediaFile } from "./media";
import type { HistoryEntry, JudgeQueueData, JudgeTask, QueueItem, RecentDecision } from "./types";
import { needsContestValue, type TaskScoringContext } from "./what-if";

export function toJudgeTask(task: Task): JudgeTask {
  return {
    id: task.id,
    code: task.code,
    title: task.title,
    description: task.description,
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

/** Scoring contexts (for "Worth 150 now" previews) for the given tasks. */
export async function loadScoringContexts(
  huntId: string,
  taskRows: Task[],
  teamRows: { id: string; name: string; hidden: boolean }[],
): Promise<Record<string, TaskScoringContext>> {
  if (taskRows.length === 0) return {};
  const approved = await db
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
      and(
        eq(submissions.huntId, huntId),
        eq(submissions.status, "approved"),
        inArray(
          submissions.taskId,
          taskRows.map((t) => t.id),
        ),
      ),
    );
  const engineTeams = teamRows.map((t) => ({ id: t.id, name: t.name, hidden: t.hidden }));
  const out: Record<string, TaskScoringContext> = {};
  for (const task of taskRows) {
    out[task.id] = {
      task: {
        id: task.id,
        kind: task.kind,
        scoring: task.scoring,
        points: task.points,
        minPoints: task.minPoints,
        decaySolves: task.decaySolves,
        contestRank: task.contestRank,
        contestPlaces: task.contestPlaces,
      },
      teams: engineTeams,
      approved: [],
    };
  }
  for (const s of approved) {
    const ctx = out[s.taskId];
    if (!ctx) continue;
    const sub: EngineSubmission = {
      id: s.id,
      taskId: s.taskId,
      teamId: s.teamId,
      status: "approved",
      submittedAt: s.createdAt.getTime(),
      judgedAt: s.judgedAt?.getTime() ?? null,
      pointsOverride: s.pointsOverride,
      contestValue: s.contestValue,
    };
    ctx.approved.push(sub);
  }
  return out;
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

/** Everything the judging queue needs: all pending submissions (oldest first) with their context. */
export async function loadJudgeQueue(hunt: Pick<Hunt, "id">, viewerId: string): Promise<JudgeQueueData> {
  const claimer = alias(users, "claimer");
  const [taskRows, teamRows, pendingRows] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.huntId, hunt.id)).orderBy(asc(tasks.code)),
    db
      .select({ id: teams.id, name: teams.name, emoji: teams.emoji, color: teams.color, hidden: teams.hidden })
      .from(teams)
      .where(eq(teams.huntId, hunt.id))
      .orderBy(asc(teams.name)),
    db
      .select({ sub: submissions, playerName: players.name, claimName: claimer.name })
      .from(submissions)
      .leftJoin(players, eq(players.id, submissions.playerId))
      .leftJoin(claimer, eq(claimer.id, submissions.claimedBy))
      .where(and(eq(submissions.huntId, hunt.id), eq(submissions.status, "pending")))
      .orderBy(asc(submissions.createdAt), asc(submissions.id)),
  ]);

  const judge = alias(users, "judge");
  const recentRows = await db
    .select({ sub: submissions, judgeName: judge.name })
    .from(submissions)
    .innerJoin(judge, eq(judge.id, submissions.judgedBy))
    .where(and(eq(submissions.huntId, hunt.id), ne(submissions.status, "pending"), isNotNull(submissions.judgedAt)))
    .orderBy(desc(submissions.judgedAt))
    .limit(10);

  const pendingTaskIds = new Set(pendingRows.map((r) => r.sub.taskId));
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
    loadScoringContexts(
      hunt.id,
      taskRows.filter((t) => pendingTaskIds.has(t.id)),
      teamRows,
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

  return {
    items,
    tasks: Object.fromEntries(taskRows.map((t) => [t.id, toJudgeTask(t)])),
    teams: Object.fromEntries(teamRows.map((t) => [t.id, t])),
    scoring,
    recent,
  };
}
