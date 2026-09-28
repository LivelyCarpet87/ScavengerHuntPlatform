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

/**
 * A team's accepted work on a task, reduced to what a what-if needs:
 * [team, submitted at, value] where value is the judge's points override on
 * standard tasks and the (aggregated) measured value on contests.
 */
export type ScoringRow = [teamId: string, submittedAt: number, value: number | null];

/**
 * What the judging queue sends per task instead of every accepted submission
 * (the queue re-sends it on every refresh): the rows that can change what
 * approving a waiting submission is worth. See compactScoring.
 */
export type CompactScoring = { task: EngineTask; rows: ScoringRow[] };

const bySubmission = (a: EngineSubmission, b: EngineSubmission) =>
  a.submittedAt - b.submittedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Reduces a task's accepted submissions to the rows a what-if needs, with the
 * same result from projectApproval for any waiting submission:
 *
 * - standard tasks: each team's solve (its earliest accepted submission), and
 *   on fixed-scoring tasks only for the teams in `reviewing` (a fixed award
 *   never depends on other teams);
 * - contests: each team's standing entry as the engine aggregates it (best,
 *   lowest, total or earliest).
 *
 * Not for re-judging an accepted submission: that needs the real list.
 */
export function compactScoring(
  task: EngineTask,
  approved: readonly EngineSubmission[],
  reviewing: ReadonlySet<string>,
): CompactScoring {
  const sorted = approved.filter((s) => s.taskId === task.id && s.status === "approved").sort(bySubmission);
  const rows: ScoringRow[] = [];

  if (task.kind !== "contest") {
    const seen = new Set<string>();
    for (const s of sorted) {
      if (seen.has(s.teamId)) continue;
      seen.add(s.teamId);
      if (task.scoring === "fixed" && !reviewing.has(s.teamId)) continue;
      rows.push([s.teamId, s.submittedAt, s.pointsOverride]);
    }
    return { task, rows };
  }

  // Contests: one aggregate per team, built exactly as the engine ranks entries.
  const agg = new Map<string, { at: number; value: number | null }>();
  for (const s of sorted) {
    const prev = agg.get(s.teamId);
    if (task.contestRank === "earliest") {
      if (!prev) agg.set(s.teamId, { at: s.submittedAt, value: null });
      continue;
    }
    const v = s.contestValue;
    if (v == null || !Number.isFinite(v)) continue;
    if (task.contestRank === "total") {
      agg.set(s.teamId, { at: Math.max(prev?.at ?? 0, s.submittedAt), value: (prev?.value ?? 0) + v });
      continue;
    }
    const better =
      !prev ||
      prev.value == null ||
      (task.contestRank === "highest" ? v > prev.value : v < prev.value) ||
      (v === prev.value && s.submittedAt < prev.at);
    if (better) agg.set(s.teamId, { at: s.submittedAt, value: v });
  }
  for (const [teamId, a] of agg) rows.push([teamId, a.at, a.value]);
  rows.sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
  return { task, rows };
}

/** Turns compact rows back into a context projectApproval can run on. */
export function expandScoring(compact: CompactScoring, teams: EngineTeam[]): TaskScoringContext {
  const { task, rows } = compact;
  const isContest = task.kind === "contest";
  return {
    task,
    teams,
    approved: rows.map(([teamId, submittedAt, value], i) => ({
      // Stand-in ids ("~" sorts after real ids); rows are in submission order, so ties break as before.
      id: `~${String(i).padStart(6, "0")}`,
      taskId: task.id,
      teamId,
      status: "approved",
      submittedAt,
      judgedAt: null,
      pointsOverride: isContest ? null : value,
      contestValue: isContest ? value : null,
    })),
  };
}

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

const PLAIN = /^(?:\d+(?:\.\d+)?|\.\d+)$/; // 184 · 18.5 · .5
const COMMA_GROUPS = /^[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?$/; // 1,500 · 12,345,678 · 1,500.5 (as the app shows numbers)
const SPACE_GROUPS = /^\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?$/; // 1 500 · 1 500,5
const DECIMAL_COMMA = /^\d+,\d+$/; // 18,5 · 0,125

/**
 * Parses a typed measurement. Thousands separators are read the way the app
 * writes numbers ("1,500" is 1500), a lone comma with anything but three
 * digits after it is a decimal comma ("18,5"), and a unit after the number
 * is ignored ("31 bikes", "184cm"). Blank -> null; anything else, including
 * ambiguous forms like "1.500,5" or "1,50,0" -> NaN.
 */
export function parseMeasured(input: string): number | null {
  let text = input.trim();
  if (text === "") return null;
  let sign = 1;
  if (/^[-\u2212\u2013]/.test(text)) {
    sign = -1;
    text = text.slice(1).trimStart();
  } else if (text.startsWith("+")) {
    text = text.slice(1).trimStart();
  }
  const match = /^([\d.,\s\u00a0\u202f]*\d)(?:\s*[^\d\s.,+\-\u2212].*)?$/su.exec(text);
  if (!match) return Number.NaN;
  const number = match[1];
  let value: number;
  if (PLAIN.test(number)) value = Number(number);
  else if (COMMA_GROUPS.test(number)) value = Number(number.replace(/,/g, ""));
  else if (SPACE_GROUPS.test(number)) value = Number(number.replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
  else if (DECIMAL_COMMA.test(number)) value = Number(number.replace(",", "."));
  else return Number.NaN;
  return value === 0 ? 0 : sign * value;
}

/** True when the typed text isn't a plain number, so the value as read is worth echoing ("1,500" -> 1500). */
export function measuredNeedsEcho(input: string): boolean {
  return !/^-?\d+(?:\.\d+)?$/.test(input.trim());
}

/** Parses a typed points override: whole numbers only; blank -> null; junk -> NaN. */
export function parsePoints(input: string): number | null {
  const trimmed = input.trim().replace(/^−/, "-");
  if (trimmed === "") return null;
  if (!/^[-+]?\d+$/.test(trimmed)) return Number.NaN;
  return Number(trimmed);
}
