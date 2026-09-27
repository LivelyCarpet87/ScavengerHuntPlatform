import {
  type ContestEntry,
  computeStandings,
  type EngineSubmission,
  type EngineTask,
  type EngineTeam,
} from "@/lib/scoring/engine";

/*
 * "What would this team hold if I approve this?" — answered by running the
 * real scoring engine on one task with the submission hypothetically
 * approved. Awards for a task depend only on that task's accepted
 * submissions and which teams are hidden, so a one-task run is exact and
 * cheap enough to repeat on every keystroke of a contest value. Pure: runs in
 * the judge's browser as well as on the server.
 */

export type TaskScoringContext = {
  task: EngineTask;
  /** Every team in the hunt (hidden ones included; the engine handles them). */
  teams: EngineTeam[];
  /** Accepted submissions for this task, all teams. */
  approved: EngineSubmission[];
};

export type ReviewedSubmission = { id: string; teamId: string; submittedAt: number };

export type Entered = { contestValue: number | null; pointsOverride: number | null };

export type ApprovalProjection = {
  /** Points the team would hold for this task with this submission approved as entered. */
  points: number;
  /** Points the team would hold for this task without this submission. */
  without: number;
  /** Points the team holds for this task right now (this submission as currently stored). */
  current: number;
  /** Standard tasks: an earlier accepted submission already counts, so approving adds nothing. */
  alreadySolved: boolean;
  /** Race tasks: the team's solve position after approval (1 = first). */
  position: number | null;
  /** Rarity tasks: what each solver holds before and after, when this approval adds a solver. */
  rarity: { before: number; after: number; solversBefore: number } | null;
  /** Contest tasks: the full ranking after approval. */
  ranking: ContestEntry[] | null;
  /** Contest tasks: this team's place after approval, or null (no value yet, or a hidden team). */
  place: number | null;
  /** Hidden teams score but are never ranked. */
  hidden: boolean;
};

function run(ctx: TaskScoringContext, submissions: EngineSubmission[]) {
  return computeStandings({
    teams: ctx.teams,
    tasks: [ctx.task],
    submissions,
    hintUnlocks: [],
    adjustments: [],
  });
}

/** True when a contest needs a measured value to rank an entry. */
export function needsContestValue(task: Pick<EngineTask, "kind" | "contestRank">): boolean {
  return task.kind === "contest" && task.contestRank !== "earliest";
}

export function projectApproval(
  ctx: TaskScoringContext,
  sub: ReviewedSubmission,
  entered: Entered,
): ApprovalProjection {
  const { task } = ctx;
  const isContest = task.kind === "contest";
  const others = ctx.approved.filter((s) => s.id !== sub.id);
  const hypothetical: EngineSubmission = {
    id: sub.id,
    taskId: task.id,
    teamId: sub.teamId,
    status: "approved",
    submittedAt: sub.submittedAt,
    judgedAt: null,
    // The engine ignores overrides on contest entries; don't pretend otherwise.
    pointsOverride: isContest ? null : entered.pointsOverride,
    contestValue: isContest ? entered.contestValue : null,
  };

  const before = run(ctx, others);
  const after = run(ctx, [...others, hypothetical]);
  const stored = ctx.approved.some((s) => s.id === sub.id) ? run(ctx, ctx.approved) : before;

  const award = (r: ReturnType<typeof run>) => r.awards[sub.teamId]?.[task.id] ?? 0;
  const hidden = ctx.teams.find((t) => t.id === sub.teamId)?.hidden ?? false;

  if (isContest) {
    const ranking = after.tasks[task.id]?.contest ?? [];
    const entry = ranking.find((e) => e.teamId === sub.teamId);
    const counts = !needsContestValue(task) || entered.contestValue != null;
    return {
      points: award(after),
      without: award(before),
      current: award(stored),
      alreadySolved: false,
      position: null,
      rarity: null,
      ranking,
      place: counts && entry ? entry.place : null,
      hidden,
    };
  }

  const solvedAt = after.solvedAt[sub.teamId]?.[task.id];
  const isSolve = solvedAt === sub.submittedAt;
  const alreadySolved = !isSolve && before.solvedAt[sub.teamId]?.[task.id] != null;

  let position: number | null = null;
  if (task.scoring === "race" && isSolve) {
    let earlier = 0;
    for (const team of ctx.teams) {
      if (team.hidden || team.id === sub.teamId) continue;
      const at = after.solvedAt[team.id]?.[task.id];
      if (at != null && at < sub.submittedAt) earlier += 1;
    }
    position = earlier + 1;
  }

  let rarity: ApprovalProjection["rarity"] = null;
  if (task.scoring === "rarity" && isSolve && !hidden && !before.solvedAt[sub.teamId]?.[task.id]) {
    const b = before.tasks[task.id];
    const a = after.tasks[task.id];
    if (b && a) rarity = { before: b.currentValue, after: a.currentValue, solversBefore: b.solves };
  }

  return {
    points: award(after),
    without: award(before),
    current: award(stored),
    alreadySolved,
    position,
    rarity,
    ranking: null,
    place: null,
    hidden,
  };
}

/** Parses a typed measurement: "184", "18.5", "18,5", " 31 bikes" -> number; blank -> null; junk -> NaN. */
export function parseMeasured(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const match = /^[-+]?\d+(?:[.,]\d+)?/.exec(trimmed.replace(/\s+/g, ""));
  if (!match) return Number.NaN;
  return Number(match[0].replace(",", "."));
}

/** Parses a typed points override: whole numbers only; blank -> null; junk -> NaN. */
export function parsePoints(input: string): number | null {
  const trimmed = input.trim().replace(/^−/, "-");
  if (trimmed === "") return null;
  if (!/^[-+]?\d+$/.test(trimmed)) return Number.NaN;
  return Number(trimmed);
}
