import { describe, expect, test } from "bun:test";
import type { EngineSubmission, EngineTask } from "@/lib/scoring/engine";
import {
  compactScoring,
  expandScoring,
  measuredNeedsEcho,
  needsContestValue,
  parseMeasured,
  parsePoints,
  projectApproval,
  type TaskScoringContext,
} from "./what-if";

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
    expect(parseMeasured("   ")).toBeNull();
    expect(parseMeasured("lots")).toBeNaN();
  });

  test("thousands separators read the way the app writes numbers", () => {
    expect(parseMeasured("1,500")).toBe(1500);
    expect(parseMeasured("2,350.5")).toBe(2350.5);
    expect(parseMeasured("1,500,000")).toBe(1_500_000);
    expect(parseMeasured("12,345")).toBe(12_345);
    expect(parseMeasured("1,500 people")).toBe(1500);
    expect(parseMeasured("1 500")).toBe(1500);
    expect(parseMeasured("1\u202f500,5")).toBe(1500.5);
    // "1.500" is one and a half, as in English.
    expect(parseMeasured("1.500")).toBe(1.5);
  });

  test("a decimal comma still works when it can't be a thousands separator", () => {
    expect(parseMeasured("0,125")).toBe(0.125);
    expect(parseMeasured("1,5000")).toBe(1.5);
    expect(parseMeasured("1234,5")).toBe(1234.5);
  });

  test("units, signs and loose forms", () => {
    expect(parseMeasured("184cm")).toBe(184);
    expect(parseMeasured("184 cm")).toBe(184);
    expect(parseMeasured("50%")).toBe(50);
    expect(parseMeasured(".5")).toBe(0.5);
    expect(parseMeasured("−12")).toBe(-12);
    expect(parseMeasured("-1,500")).toBe(-1500);
    expect(parseMeasured("+7")).toBe(7);
    expect(Object.is(parseMeasured("-0"), 0)).toBe(true);
  });

  test("ambiguous or malformed numbers are refused, not guessed", () => {
    for (const bad of ["3.2.1", "1,50,0", "1.500,5", "1,500,5", "18 5", "--5", "5.", "~184", "cm 184"]) {
      expect(parseMeasured(bad)).toBeNaN();
    }
  });

  test("the value as read is echoed only when the text isn't a plain number", () => {
    expect(measuredNeedsEcho("1500")).toBe(false);
    expect(measuredNeedsEcho("18.5")).toBe(false);
    expect(measuredNeedsEcho("1,500")).toBe(true);
    expect(measuredNeedsEcho("18,5")).toBe(true);
    expect(measuredNeedsEcho("184cm")).toBe(true);
  });

  test("points", () => {
    expect(parsePoints("150")).toBe(150);
    expect(parsePoints("−20")).toBe(-20);
    expect(parsePoints(" ")).toBeNull();
    expect(parsePoints("12.5")).toBeNaN();
  });
});

describe("compact scoring rows", () => {
  // A small deterministic PRNG so failures reproduce.
  function rng(seed: number) {
    let x = seed;
    return () => {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      return x / 0x7fffffff;
    };
  }

  const tasks: EngineTask[] = [
    task({ id: "fixed" }),
    task({ id: "rarity", scoring: "rarity", points: 150, minPoints: 60, decaySolves: 6 }),
    task({ id: "race", scoring: "race", points: 150, minPoints: 60, decaySolves: 6 }),
    task({ id: "high", kind: "contest", contestRank: "highest", points: 200, minPoints: 60, contestPlaces: 3 }),
    task({ id: "low", kind: "contest", contestRank: "lowest", points: 200, minPoints: 60, contestPlaces: 3 }),
    task({ id: "total", kind: "contest", contestRank: "total", points: 100, minPoints: 20, contestPlaces: 5 }),
    task({ id: "first", kind: "contest", contestRank: "earliest", points: 100, minPoints: 20, contestPlaces: 2 }),
  ];
  const many = [
    ...teams,
    { id: "d", name: "Dippers", hidden: false },
    { id: "e", name: "Egrets", hidden: false },
    { id: "g", name: "Geckos", hidden: true },
  ];

  test("give the same what-if as every accepted submission", () => {
    const next = rng(7);
    let checked = 0;
    for (let round = 0; round < 300; round++) {
      const t = tasks[round % tasks.length];
      const approvedSubs: EngineSubmission[] = [];
      const n = Math.floor(next() * 14);
      for (let i = 0; i < n; i++) {
        const team = many[Math.floor(next() * many.length)];
        approvedSubs.push({
          id: `s${round}-${i}`,
          taskId: t.id,
          teamId: team.id,
          status: "approved",
          // Real submission times differ by milliseconds, so what-ifs never hinge on id tie-breaks.
          submittedAt: min(Math.floor(next() * 60)) + Math.floor(next() * 60_000),
          judgedAt: null,
          pointsOverride: t.kind !== "contest" && next() < 0.2 ? Math.floor(next() * 90) : null,
          contestValue: t.kind === "contest" && next() < 0.9 ? Math.round(next() * 500) / 2 : null,
        });
      }
      const full: TaskScoringContext = { task: t, teams: many, approved: approvedSubs };
      const reviewedTeam = many[Math.floor(next() * many.length)];
      const sub = {
        id: `z${round}`,
        teamId: reviewedTeam.id,
        submittedAt: min(Math.floor(next() * 70)) + Math.floor(next() * 60_000),
      };
      const compact = expandScoring(compactScoring(t, approvedSubs, new Set([reviewedTeam.id])), many);
      for (const entered of [
        none,
        { contestValue: Math.round(next() * 500) / 2, pointsOverride: null },
        { contestValue: null, pointsOverride: 42 },
      ]) {
        const a = projectApproval(full, sub, entered);
        const b = projectApproval(compact, sub, entered);
        expect({
          ...b,
          ranking: b.ranking?.map(({ teamId, place, value, points }) => ({ teamId, place, value, points })),
        }).toEqual({
          ...a,
          ranking: a.ranking?.map(({ teamId, place, value, points }) => ({ teamId, place, value, points })),
        });
        checked++;
      }
    }
    expect(checked).toBe(900);
  });

  test("keep one row per team, and on fixed tasks only the teams being reviewed", () => {
    const subs = [
      approved("a1", "a", min(1), { pointsOverride: 40 }),
      approved("a2", "a", min(5)),
      approved("b1", "b", min(2)),
    ];
    expect(compactScoring(task(), subs, new Set(["a"])).rows).toEqual([["a", min(1), 40]]);
    const race = task({ scoring: "race" });
    expect(compactScoring(race, subs, new Set()).rows).toEqual([
      ["a", min(1), 40],
      ["b", min(2), null],
    ]);
  });

  test("contest rows carry each team's standing entry", () => {
    const t = task({ kind: "contest", contestRank: "total" });
    const subs = [
      approved("a1", "a", min(1), { contestValue: 10 }),
      approved("a2", "a", min(4), { contestValue: 5 }),
      approved("b1", "b", min(2), { contestValue: null }),
    ];
    expect(compactScoring(t, subs, new Set()).rows).toEqual([["a", min(4), 15]]);
  });
});
