import { describe, expect, test } from "bun:test";
import type { EngineSubmission, EngineTask } from "@/lib/scoring/engine";
import { needsContestValue, parseMeasured, parsePoints, projectApproval, type TaskScoringContext } from "./what-if";

const T0 = Date.UTC(2026, 8, 27, 18, 0, 0);
const min = (n: number) => T0 + n * 60_000;

function task(over: Partial<EngineTask> = {}): EngineTask {
  return {
    id: "t",
    kind: "media",
    scoring: "fixed",
    points: 100,
    minPoints: 0,
    decaySolves: 10,
    contestRank: "highest",
    contestPlaces: 3,
    ...over,
  };
}

function approved(id: string, teamId: string, at: number, over: Partial<EngineSubmission> = {}): EngineSubmission {
  return {
    id,
    taskId: "t",
    teamId,
    status: "approved",
    submittedAt: at,
    judgedAt: at + 60_000,
    pointsOverride: null,
    contestValue: null,
    ...over,
  };
}

const teams = [
  { id: "a", name: "Aardvarks", hidden: false },
  { id: "b", name: "Badgers", hidden: false },
  { id: "c", name: "Cranes", hidden: false },
  { id: "h", name: "Staff", hidden: true },
];

const ctx = (t: EngineTask, subs: EngineSubmission[] = []): TaskScoringContext => ({ task: t, teams, approved: subs });
const none = { contestValue: null, pointsOverride: null };

describe("projectApproval — standard tasks", () => {
  test("fixed tasks are worth their points", () => {
    const p = projectApproval(ctx(task()), { id: "s1", teamId: "a", submittedAt: min(5) }, none);
    expect(p.points).toBe(100);
    expect(p.without).toBe(0);
    expect(p.current).toBe(0);
    expect(p.alreadySolved).toBe(false);
  });

  test("a judge's override replaces the computed value", () => {
    const p = projectApproval(
      ctx(task()),
      { id: "s1", teamId: "a", submittedAt: min(5) },
      {
        contestValue: null,
        pointsOverride: 35,
      },
    );
    expect(p.points).toBe(35);
  });

  test("race position follows submission time, not judging order", () => {
    const t = task({ scoring: "race", points: 150, minPoints: 60, decaySolves: 6 });
    // b solved at minute 10 and was judged first; a submitted at minute 5.
    const p = projectApproval(
      ctx(t, [approved("sb", "b", min(10))]),
      { id: "sa", teamId: "a", submittedAt: min(5) },
      none,
    );
    expect(p.position).toBe(1);
    expect(p.points).toBe(150);
    const later = projectApproval(
      ctx(t, [approved("sb", "b", min(10))]),
      { id: "sc", teamId: "c", submittedAt: min(20) },
      none,
    );
    expect(later.position).toBe(2);
    expect(later.points).toBe(147);
  });

  test("rarity approvals lower the value for every solver", () => {
    const t = task({ scoring: "rarity", points: 150, minPoints: 60, decaySolves: 6 });
    const p = projectApproval(
      ctx(t, [approved("sa", "a", min(1)), approved("sb", "b", min(2))]),
      { id: "sc", teamId: "c", submittedAt: min(3) },
      none,
    );
    expect(p.rarity).toEqual({ before: 147, after: 136, solversBefore: 2 });
    expect(p.points).toBe(136);
  });

  test("a second accepted submission adds nothing", () => {
    const p = projectApproval(
      ctx(task(), [approved("sa", "a", min(1))]),
      { id: "sa2", teamId: "a", submittedAt: min(9) },
      none,
    );
    expect(p.alreadySolved).toBe(true);
    expect(p.points).toBe(100);
    expect(p.without).toBe(100);
  });

  test("an earlier submission approved later becomes the solve", () => {
    const p = projectApproval(
      ctx(task(), [approved("late", "a", min(9), { pointsOverride: 40 })]),
      { id: "early", teamId: "a", submittedAt: min(1) },
      none,
    );
    expect(p.alreadySolved).toBe(false);
    expect(p.points).toBe(100);
    expect(p.without).toBe(40);
  });

  test("re-judging an accepted submission reports what it holds now", () => {
    const p = projectApproval(
      ctx(task(), [approved("sa", "a", min(1), { pointsOverride: 70 })]),
      { id: "sa", teamId: "a", submittedAt: min(1) },
      { contestValue: null, pointsOverride: null },
    );
    expect(p.current).toBe(70);
    expect(p.points).toBe(100);
    expect(p.without).toBe(0);
  });

  test("hidden teams score but are flagged", () => {
    const p = projectApproval(ctx(task()), { id: "s", teamId: "h", submittedAt: min(1) }, none);
    expect(p.hidden).toBe(true);
    expect(p.points).toBe(100);
  });
});

describe("projectApproval — contests", () => {
  const contest = task({ kind: "contest", points: 200, minPoints: 60, contestPlaces: 3, contestRank: "highest" });

  test("ranks the entered value against accepted entries", () => {
    const c = ctx(contest, [
      approved("sa", "a", min(1), { contestValue: 212 }),
      approved("sb", "b", min(2), { contestValue: 185 }),
    ]);
    const p = projectApproval(
      c,
      { id: "sc", teamId: "c", submittedAt: min(3) },
      { contestValue: 190, pointsOverride: null },
    );
    expect(p.place).toBe(2);
    expect(p.points).toBe(101);
    expect(p.ranking?.map((e) => e.teamId)).toEqual(["a", "c", "b"]);
  });

  test("without a value the entry isn't ranked yet", () => {
    const p = projectApproval(ctx(contest), { id: "s", teamId: "a", submittedAt: min(1) }, none);
    expect(p.place).toBeNull();
    expect(p.points).toBe(0);
  });

  test("overrides don't apply to contest entries", () => {
    const p = projectApproval(
      ctx(contest),
      { id: "s", teamId: "a", submittedAt: min(1) },
      {
        contestValue: 10,
        pointsOverride: 999,
      },
    );
    expect(p.points).toBe(200);
  });

  test("a team's best entry counts for highest-value contests", () => {
    const c = ctx(contest, [approved("sa", "a", min(1), { contestValue: 212 })]);
    const p = projectApproval(
      c,
      { id: "sa2", teamId: "a", submittedAt: min(5) },
      { contestValue: 100, pointsOverride: null },
    );
    expect(p.place).toBe(1);
    expect(p.ranking?.[0].value).toBe(212);
  });

  test("earliest contests need no value", () => {
    const t = task({ kind: "contest", contestRank: "earliest", points: 100, minPoints: 20, contestPlaces: 2 });
    expect(needsContestValue(t)).toBe(false);
    const p = projectApproval(
      ctx(t, [approved("sb", "b", min(4))]),
      { id: "sa", teamId: "a", submittedAt: min(2) },
      none,
    );
    expect(p.place).toBe(1);
    expect(p.points).toBe(100);
  });

  test("hidden teams never take contest places", () => {
    const p = projectApproval(
      ctx(contest),
      { id: "s", teamId: "h", submittedAt: min(1) },
      { contestValue: 500, pointsOverride: null },
    );
    expect(p.place).toBeNull();
    expect(p.points).toBe(0);
    expect(p.hidden).toBe(true);
  });
});

describe("parsing typed numbers", () => {
  test("measured values", () => {
    expect(parseMeasured("184")).toBe(184);
    expect(parseMeasured("18.5")).toBe(18.5);
    expect(parseMeasured("18,5")).toBe(18.5);
    expect(parseMeasured(" 31 bikes")).toBe(31);
    expect(parseMeasured("")).toBeNull();
    expect(parseMeasured("lots")).toBeNaN();
  });

  test("points", () => {
    expect(parsePoints("150")).toBe(150);
    expect(parsePoints("−20")).toBe(-20);
    expect(parsePoints(" ")).toBeNull();
    expect(parsePoints("12.5")).toBeNaN();
  });
});
