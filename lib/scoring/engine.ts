/**
 * Scoring engine — a pure function from hunt data to standings.
 *
 * No database or framework imports: everything it needs is passed in, which
 * keeps it trivially unit-testable (`bun test lib/scoring`) and lets the
 * scoreboard, team dashboard, exports and big screen share one definition of
 * "the score".
 *
 * Rules
 * -----
 * Standard tasks (media / answer / checkpoint):
 *   A team solves a task with its earliest approved submission. Its award is the
 *   judge's `pointsOverride` on that submission if set, otherwise:
 *     fixed   `points`
 *     rarity  decayValue(S) for every solver, where S = number of teams that solved
 *             (the value drops for everyone as more teams solve — CTF-style)
 *     race    decayValue(k) where k is the team's solve position (1st, 2nd, …)
 *   decayValue(n) falls quadratically from `points` (n = 1) to `minPoints`
 *   (n = decaySolves) and never below it.
 *
 * Contest tasks:
 *   Judges record a numeric `contestValue` on approved entries. Teams are ranked
 *   by their best (highest/lowest), their total, or their earliest approved
 *   entry. The top `contestPlaces` teams earn placement points on a steep curve
 *   from `points` (1st) to `minPoints` (last scoring place).
 *
 * Totals = task points + contest points − revealed hint costs + adjustments.
 * Ranking: higher total first; ties go to the team that reached its score
 * first (earliest last scoring event); identical on both counts share a rank.
 *
 * Hidden teams (staff test runs) get a score, but don't count toward solve
 * counts, race order or contest places, and don't receive a rank.
 *
 * With a `cutoff` (scoreboard freeze), only submissions made and judged at or
 * before the cutoff, and hints/adjustments created by then, are counted.
 */

export type EngineTaskKind = "media" | "answer" | "checkpoint" | "contest";
export type EngineScoring = "fixed" | "rarity" | "race";
export type EngineContestRank = "highest" | "lowest" | "total" | "earliest";

export type EngineTask = {
  id: string;
  kind: EngineTaskKind;
  scoring: EngineScoring;
  points: number;
  minPoints: number;
  decaySolves: number;
  contestRank: EngineContestRank;
  contestPlaces: number;
};

export type EngineSubmission = {
  id: string;
  taskId: string;
  teamId: string;
  status: "pending" | "approved" | "rejected";
  /** When the team submitted (ms since epoch). */
  submittedAt: number;
  /** When it was judged (ms since epoch); null while pending. */
  judgedAt: number | null;
  pointsOverride: number | null;
  contestValue: number | null;
};

export type EngineTeam = { id: string; name: string; hidden: boolean };
export type EngineHintUnlock = { teamId: string; cost: number; at: number };
export type EngineAdjustment = { teamId: string; points: number; at: number };

export type EngineInput = {
  teams: EngineTeam[];
  tasks: EngineTask[];
  submissions: EngineSubmission[];
  hintUnlocks: EngineHintUnlock[];
  adjustments: EngineAdjustment[];
  /** Freeze instant (ms). Events after it are ignored. */
  cutoff?: number | null;
};

export type TeamStanding = {
  teamId: string;
  name: string;
  /** 1-based rank; null for hidden teams. */
  rank: number | null;
  total: number;
  taskPoints: number;
  contestPoints: number;
  /** Points spent on hints (a positive number, subtracted from the total). */
  hintPenalty: number;
  adjustmentPoints: number;
  /** Standard (non-contest) tasks solved. */
  solved: number;
  /** Contests in which the team earned a scoring place. */
  placements: number;
  /** When the team reached its current score (ms); null if it never scored. */
  lastScoredAt: number | null;
  hidden: boolean;
};

export type ContestEntry = {
  teamId: string;
  place: number;
  /** The aggregated value (best, lowest or total); null for "earliest" contests. */
  value: number | null;
  /** Time used for ordering/tie-breaks (ms). */
  at: number;
  points: number;
};

export type TaskStat = {
  taskId: string;
  /** Visible teams that solved (standard) or have a ranked entry (contest). */
  solves: number;
  /** What the next team to solve would earn right now. */
  nextValue: number;
  /** Rarity tasks: what each current solver holds now. Equals nextValue otherwise. */
  currentValue: number;
  /** Contest tasks: ranked entries of visible teams (all of them, not just scoring places). */
  contest?: ContestEntry[];
};

export type EngineResult = {
  /** Visible teams in rank order, then hidden teams by score. */
  standings: TeamStanding[];
  tasks: Record<string, TaskStat>;
  /** teamId → taskId → points earned from that task (standard and contest). */
  awards: Record<string, Record<string, number>>;
  /** teamId → taskId → when the team solved it (ms). Standard tasks only. */
  solvedAt: Record<string, Record<string, number>>;
};

/** Value of the n-th solve (1-based) on a decaying task. */
export function decayValue(n: number, points: number, minPoints: number, decaySolves: number): number {
  const max = points;
  const min = Math.min(minPoints, points);
  if (n <= 1) return max;
  if (decaySolves <= 1) return min;
  const t = Math.min(1, (n - 1) / (decaySolves - 1));
  return Math.max(min, Math.ceil(max - (max - min) * t * t));
}

/** Points for a contest place (1-based). Places beyond `places` earn nothing. */
export function placementPoints(place: number, places: number, points: number, minPoints: number): number {
  if (place < 1 || place > places) return 0;
  const max = points;
  const min = Math.min(minPoints, points);
  if (place === 1) return max;
  if (place === places) return min;
  const remaining = (places - (place - 1)) / places;
  return Math.round(remaining ** 3 * (max - min) + min);
}

/** The full placement ladder for previews: [1st, 2nd, …]. */
export function placementLadder(places: number, points: number, minPoints: number): number[] {
  return Array.from({ length: Math.max(0, places) }, (_, i) => placementPoints(i + 1, places, points, minPoints));
}

function counts(sub: EngineSubmission, cutoff: number | null | undefined): boolean {
  if (sub.status !== "approved") return false;
  if (cutoff == null) return true;
  if (sub.submittedAt > cutoff) return false;
  if (sub.judgedAt != null && sub.judgedAt > cutoff) return false;
  return true;
}

function bump(map: Record<string, Record<string, number>>, teamId: string, taskId: string, points: number) {
  const row = map[teamId] ?? {};
  map[teamId] = row;
  row[taskId] = (row[taskId] ?? 0) + points;
}

export function computeStandings(input: EngineInput): EngineResult {
  const { cutoff } = input;
  const teamById = new Map(input.teams.map((t) => [t.id, t]));
  const isVisible = (teamId: string) => {
    const team = teamById.get(teamId);
    return !!team && !team.hidden;
  };

  const standings = new Map<string, TeamStanding>();
  for (const team of input.teams) {
    standings.set(team.id, {
      teamId: team.id,
      name: team.name,
      rank: null,
      total: 0,
      taskPoints: 0,
      contestPoints: 0,
      hintPenalty: 0,
      adjustmentPoints: 0,
      solved: 0,
      placements: 0,
      lastScoredAt: null,
      hidden: team.hidden,
    });
  }
  const touch = (s: TeamStanding, at: number) => {
    if (s.lastScoredAt == null || at > s.lastScoredAt) s.lastScoredAt = at;
  };

  // Group counting submissions by task, ignoring unknown teams.
  const byTask = new Map<string, EngineSubmission[]>();
  for (const sub of input.submissions) {
    if (!teamById.has(sub.teamId) || !counts(sub, cutoff)) continue;
    const list = byTask.get(sub.taskId) ?? [];
    list.push(sub);
    byTask.set(sub.taskId, list);
  }

  const awards: EngineResult["awards"] = {};
  const solvedAt: EngineResult["solvedAt"] = {};
  const taskStats: EngineResult["tasks"] = {};

  for (const task of input.tasks) {
    const subs = byTask.get(task.id) ?? [];

    if (task.kind === "contest") {
      const entries = rankContest(
        task,
        subs.filter((s) => isVisible(s.teamId)),
      );
      for (const entry of entries) {
        if (entry.points <= 0) continue;
        const s = standings.get(entry.teamId);
        if (!s) continue;
        s.contestPoints += entry.points;
        s.placements += 1;
        touch(s, entry.at);
        bump(awards, entry.teamId, task.id, entry.points);
      }
      // A new entry can still take first place, so advertise the top prize.
      taskStats[task.id] = {
        taskId: task.id,
        solves: entries.length,
        nextValue: task.points,
        currentValue: task.points,
        contest: entries,
      };
      continue;
    }

    // Earliest approved submission per team is its solve.
    const solveByTeam = new Map<string, EngineSubmission>();
    for (const sub of subs) {
      const prev = solveByTeam.get(sub.teamId);
      if (!prev || sub.submittedAt < prev.submittedAt || (sub.submittedAt === prev.submittedAt && sub.id < prev.id)) {
        solveByTeam.set(sub.teamId, sub);
      }
    }
    const visibleSolves = [...solveByTeam.values()]
      .filter((s) => isVisible(s.teamId))
      .sort((a, b) => a.submittedAt - b.submittedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const S = visibleSolves.length;
    const racePosition = new Map(visibleSolves.map((s, i) => [s.teamId, i + 1]));

    for (const [teamId, sub] of solveByTeam) {
      let value: number;
      if (task.scoring === "fixed") {
        value = task.points;
      } else if (task.scoring === "rarity") {
        // Hidden teams are valued as if they were one more solver.
        value = decayValue(isVisible(teamId) ? S : S + 1, task.points, task.minPoints, task.decaySolves);
      } else {
        const position = racePosition.get(teamId) ?? countEarlier(visibleSolves, sub.submittedAt) + 1;
        value = decayValue(position, task.points, task.minPoints, task.decaySolves);
      }
      const award = sub.pointsOverride ?? value;
      const s = standings.get(teamId);
      if (!s) continue;
      s.taskPoints += award;
      s.solved += 1;
      if (award > 0) touch(s, sub.submittedAt);
      bump(awards, teamId, task.id, award);
      const solvedRow = solvedAt[teamId] ?? {};
      solvedAt[teamId] = solvedRow;
      solvedRow[task.id] = sub.submittedAt;
    }

    const nextValue =
      task.scoring === "fixed" ? task.points : decayValue(S + 1, task.points, task.minPoints, task.decaySolves);
    const currentValue =
      task.scoring === "rarity" ? decayValue(Math.max(S, 1), task.points, task.minPoints, task.decaySolves) : nextValue;
    taskStats[task.id] = { taskId: task.id, solves: S, nextValue, currentValue };
  }

  for (const hint of input.hintUnlocks) {
    if (cutoff != null && hint.at > cutoff) continue;
    const s = standings.get(hint.teamId);
    if (s) s.hintPenalty += hint.cost;
  }
  for (const adj of input.adjustments) {
    if (cutoff != null && adj.at > cutoff) continue;
    const s = standings.get(adj.teamId);
    if (s) s.adjustmentPoints += adj.points;
  }

  const all = [...standings.values()];
  for (const s of all) s.total = s.taskPoints + s.contestPoints - s.hintPenalty + s.adjustmentPoints;

  const byScore = (a: TeamStanding, b: TeamStanding) =>
    b.total - a.total ||
    compareNullableTime(a.lastScoredAt, b.lastScoredAt) ||
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
    (a.teamId < b.teamId ? -1 : 1);

  const visible = all.filter((s) => !s.hidden).sort(byScore);
  visible.forEach((s, i) => {
    const prev = visible[i - 1];
    s.rank = prev && prev.total === s.total && prev.lastScoredAt === s.lastScoredAt ? (prev.rank ?? i + 1) : i + 1;
  });
  const hidden = all.filter((s) => s.hidden).sort(byScore);

  return { standings: [...visible, ...hidden], tasks: taskStats, awards, solvedAt };
}

function compareNullableTime(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function countEarlier(sorted: EngineSubmission[], at: number): number {
  let n = 0;
  for (const s of sorted) if (s.submittedAt <= at) n++;
  return n;
}

function rankContest(task: EngineTask, subs: EngineSubmission[]): ContestEntry[] {
  type Agg = { teamId: string; value: number | null; at: number };
  const aggs = new Map<string, Agg>();

  for (const sub of subs) {
    const prev = aggs.get(sub.teamId);
    if (task.contestRank === "earliest") {
      if (!prev || sub.submittedAt < prev.at)
        aggs.set(sub.teamId, { teamId: sub.teamId, value: null, at: sub.submittedAt });
      continue;
    }
    if (sub.contestValue == null || !Number.isFinite(sub.contestValue)) continue;
    const v = sub.contestValue;
    if (task.contestRank === "total") {
      aggs.set(sub.teamId, {
        teamId: sub.teamId,
        value: (prev?.value ?? 0) + v,
        at: Math.max(prev?.at ?? 0, sub.submittedAt),
      });
      continue;
    }
    const better =
      !prev ||
      prev.value == null ||
      (task.contestRank === "highest" ? v > prev.value : v < prev.value) ||
      (v === prev.value && sub.submittedAt < prev.at);
    if (better) aggs.set(sub.teamId, { teamId: sub.teamId, value: v, at: sub.submittedAt });
  }

  const sorted = [...aggs.values()].sort((a, b) => {
    if (task.contestRank !== "earliest") {
      const av = a.value ?? 0;
      const bv = b.value ?? 0;
      const diff = task.contestRank === "lowest" ? av - bv : bv - av;
      if (diff !== 0) return diff;
    }
    return a.at - b.at || (a.teamId < b.teamId ? -1 : 1);
  });

  return sorted.map((agg, i) => ({
    teamId: agg.teamId,
    place: i + 1,
    value: agg.value,
    at: agg.at,
    points: placementPoints(i + 1, task.contestPlaces, task.points, task.minPoints),
  }));
}
