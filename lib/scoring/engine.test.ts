import { describe, expect, test } from "bun:test";
import {
  computeStandings,
  decayValue,
  type EngineInput,
  type EngineSubmission,
  type EngineTask,
  placementLadder,
  placementPoints,
} from "./engine";

const T0 = Date.UTC(2026, 8, 27, 12, 0, 0);
const min = (n: number) => T0 + n * 60_000;

function task(id: string, over: Partial<EngineTask> = {}): EngineTask {
  return {
    id,
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

let seq = 0;
function sub(teamId: string, taskId: string, at: number, over: Partial<EngineSubmission> = {}): EngineSubmission {
  seq += 1;
  return {
    id: `s${String(seq).padStart(4, "0")}`,
    teamId,
    taskId,
    status: "approved",
    submittedAt: at,
    judgedAt: at + 30_000,
    pointsOverride: null,
    contestValue: null,
    ...over,
  };
}

function input(over: Partial<EngineInput>): EngineInput {
  return {
    teams: [
      { id: "a", name: "Aardvarks", hidden: false },
      { id: "b", name: "Badgers", hidden: false },
      { id: "c", name: "Cranes", hidden: false },
    ],
    tasks: [],
    submissions: [],
    hintUnlocks: [],
    adjustments: [],
    ...over,
  };
}

const byTeam = (r: ReturnType<typeof computeStandings>) => Object.fromEntries(r.standings.map((s) => [s.teamId, s]));

describe("decayValue", () => {
  test("first solve is worth full points and decays to the floor", () => {
    expect(decayValue(1, 100, 20, 5)).toBe(100);
    expect(decayValue(5, 100, 20, 5)).toBe(20);
    expect(decayValue(50, 100, 20, 5)).toBe(20);
  });
  test("decays quadratically and monotonically", () => {
    const values = Array.from({ length: 10 }, (_, i) => decayValue(i + 1, 500, 100, 10));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
    // Gentle at first: the 2nd solver keeps almost everything.
    expect(values[1]).toBeGreaterThan(490);
  });
  test("degenerate settings", () => {
    expect(decayValue(2, 100, 30, 1)).toBe(30);
    expect(decayValue(3, 100, 150, 5)).toBe(100); // floor above max is clamped
  });
});

describe("placementPoints", () => {
  test("matches the steep curve from 1st to last place", () => {
    expect(placementLadder(5, 100, 20)).toEqual([100, 61, 37, 25, 20]);
    expect(placementPoints(6, 5, 100, 20)).toBe(0);
    expect(placementLadder(1, 50, 10)).toEqual([50]);
  });
});

describe("standard tasks", () => {
  test("fixed tasks award full points to every solver, once", () => {
    const r = computeStandings(
      input({
        tasks: [task("t1")],
        submissions: [sub("a", "t1", min(1)), sub("a", "t1", min(2)), sub("b", "t1", min(3))],
      }),
    );
    const s = byTeam(r);
    expect(s.a.total).toBe(100);
    expect(s.b.total).toBe(100);
    expect(s.a.solved).toBe(1);
    expect(r.tasks.t1.solves).toBe(2);
  });

  test("pending and rejected submissions score nothing", () => {
    const r = computeStandings(
      input({
        tasks: [task("t1")],
        submissions: [sub("a", "t1", min(1), { status: "pending" }), sub("b", "t1", min(1), { status: "rejected" })],
      }),
    );
    expect(byTeam(r).a.total).toBe(0);
    expect(byTeam(r).b.total).toBe(0);
    expect(r.tasks.t1.solves).toBe(0);
  });

  test("rarity scoring lowers the value for every solver", () => {
    const t = task("t1", { scoring: "rarity", points: 100, minPoints: 20, decaySolves: 3 });
    const one = computeStandings(input({ tasks: [t], submissions: [sub("a", "t1", min(1))] }));
    expect(byTeam(one).a.total).toBe(100);
    const three = computeStandings(
      input({ tasks: [t], submissions: [sub("a", "t1", min(1)), sub("b", "t1", min(2)), sub("c", "t1", min(3))] }),
    );
    const s = byTeam(three);
    expect(s.a.total).toBe(20);
    expect(s.b.total).toBe(20);
    expect(s.c.total).toBe(20);
    expect(three.tasks.t1.currentValue).toBe(20);
  });

  test("race scoring rewards solve order by submission time, not judging time", () => {
    const t = task("t1", { scoring: "race", points: 100, minPoints: 20, decaySolves: 3 });
    const r = computeStandings(
      input({
        tasks: [t],
        submissions: [
          // b submitted first but was judged last — it still gets first place.
          sub("b", "t1", min(1), { judgedAt: min(30) }),
          sub("a", "t1", min(2)),
          sub("c", "t1", min(3)),
        ],
      }),
    );
    const s = byTeam(r);
    expect(s.b.total).toBe(100);
    expect(s.a.total).toBe(decayValue(2, 100, 20, 3));
    expect(s.c.total).toBe(20);
    expect(r.tasks.t1.nextValue).toBe(20);
  });

  test("judge override replaces the computed award", () => {
    const r = computeStandings(
      input({
        tasks: [task("t1", { points: 100 })],
        submissions: [sub("a", "t1", min(1), { pointsOverride: 40 }), sub("b", "t1", min(2), { pointsOverride: 150 })],
      }),
    );
    expect(byTeam(r).a.total).toBe(40);
    expect(byTeam(r).b.total).toBe(150);
  });
});

describe("contests", () => {
  const contest = (over: Partial<EngineTask> = {}) =>
    task("k", { kind: "contest", points: 100, minPoints: 20, contestPlaces: 2, ...over });

  test("highest value wins; ties go to the earlier entry", () => {
    const r = computeStandings(
      input({
        tasks: [contest()],
        submissions: [
          sub("a", "k", min(5), { contestValue: 180 }),
          sub("b", "k", min(1), { contestValue: 180 }),
          sub("c", "k", min(2), { contestValue: 120 }),
          sub("a", "k", min(9), { contestValue: 150 }),
        ],
      }),
    );
    const s = byTeam(r);
    expect(s.b.contestPoints).toBe(100);
    expect(s.a.contestPoints).toBe(20);
    expect(s.c.contestPoints).toBe(0);
    expect(r.tasks.k.contest?.map((e) => e.teamId)).toEqual(["b", "a", "c"]);
  });

  test("lowest and total rankings", () => {
    const subs = [
      sub("a", "k", min(1), { contestValue: 30 }),
      sub("a", "k", min(2), { contestValue: 30 }),
      sub("b", "k", min(3), { contestValue: 50 }),
    ];
    const lowest = computeStandings(input({ tasks: [contest({ contestRank: "lowest" })], submissions: subs }));
    expect(lowest.tasks.k.contest?.[0].teamId).toBe("a");
    const total = computeStandings(input({ tasks: [contest({ contestRank: "total" })], submissions: subs }));
    expect(total.tasks.k.contest?.[0]).toMatchObject({ teamId: "a", value: 60 });
  });

  test("earliest ranks by first approved entry and ignores values", () => {
    const r = computeStandings(
      input({
        tasks: [contest({ contestRank: "earliest" })],
        submissions: [sub("a", "k", min(4)), sub("b", "k", min(2)), sub("c", "k", min(3), { status: "rejected" })],
      }),
    );
    expect(r.tasks.k.contest?.map((e) => e.teamId)).toEqual(["b", "a"]);
  });

  test("entries without a recorded value are not ranked", () => {
    const r = computeStandings(input({ tasks: [contest()], submissions: [sub("a", "k", min(1))] }));
    expect(r.tasks.k.contest).toEqual([]);
  });
});

describe("totals and ranking", () => {
  test("hints subtract and adjustments add", () => {
    const r = computeStandings(
      input({
        tasks: [task("t1")],
        submissions: [sub("a", "t1", min(1))],
        hintUnlocks: [{ teamId: "a", cost: 15, at: min(0) }],
        adjustments: [
          { teamId: "a", points: 25, at: min(2) },
          { teamId: "b", points: -10, at: min(2) },
        ],
      }),
    );
    const s = byTeam(r);
    expect(s.a.total).toBe(110);
    expect(s.a.hintPenalty).toBe(15);
    expect(s.b.total).toBe(-10);
    expect(r.standings.map((x) => x.teamId)).toEqual(["a", "c", "b"]);
  });

  test("equal totals: the team that got there first ranks higher", () => {
    const r = computeStandings(
      input({ tasks: [task("t1")], submissions: [sub("b", "t1", min(5)), sub("a", "t1", min(9))] }),
    );
    expect(r.standings.map((x) => [x.teamId, x.rank])).toEqual([
      ["b", 1],
      ["a", 2],
      ["c", 3],
    ]);
  });

  test("teams that never scored share the last rank", () => {
    const r = computeStandings(input({ tasks: [task("t1")], submissions: [sub("a", "t1", min(1))] }));
    const s = byTeam(r);
    expect(s.a.rank).toBe(1);
    expect(s.b.rank).toBe(2);
    expect(s.c.rank).toBe(2);
  });

  test("hidden teams score but don't affect others or get a rank", () => {
    const t = task("t1", { scoring: "race", points: 100, minPoints: 0, decaySolves: 2 });
    const r = computeStandings(
      input({
        teams: [
          { id: "a", name: "A", hidden: false },
          { id: "z", name: "Staff test", hidden: true },
        ],
        tasks: [t],
        submissions: [sub("z", "t1", min(1)), sub("a", "t1", min(2))],
      }),
    );
    const s = byTeam(r);
    expect(s.a.total).toBe(100); // still first among real teams
    expect(s.a.rank).toBe(1);
    expect(s.z.rank).toBeNull();
    expect(r.tasks.t1.solves).toBe(1);
    expect(r.standings.at(-1)?.teamId).toBe("z");
  });

  test("freeze cutoff ignores later submissions, judgements, hints and adjustments", () => {
    const cutoff = min(10);
    const r = computeStandings(
      input({
        tasks: [task("t1"), task("t2")],
        submissions: [sub("a", "t1", min(1)), sub("a", "t2", min(12)), sub("b", "t1", min(5), { judgedAt: min(15) })],
        hintUnlocks: [{ teamId: "a", cost: 10, at: min(11) }],
        adjustments: [{ teamId: "b", points: 50, at: min(20) }],
        cutoff,
      }),
    );
    const s = byTeam(r);
    expect(s.a.total).toBe(100);
    expect(s.b.total).toBe(0);
  });

  test("awards and solvedAt maps are filled", () => {
    const r = computeStandings(input({ tasks: [task("t1")], submissions: [sub("a", "t1", min(3))] }));
    expect(r.awards.a.t1).toBe(100);
    expect(r.solvedAt.a.t1).toBe(min(3));
    expect(r.awards.b).toBeUndefined();
  });
});

describe("edge cases", () => {
  test("a zero override still counts as a solve but not as scoring time", () => {
    const r = computeStandings(
      input({
        tasks: [task("t1"), task("t2")],
        submissions: [sub("a", "t1", min(1), { pointsOverride: 0 }), sub("a", "t2", min(9))],
      }),
    );
    const s = byTeam(r);
    expect(s.a.total).toBe(100);
    expect(s.a.solved).toBe(2);
    expect(s.a.lastScoredAt).toBe(min(9));
  });

  test("hidden teams never take contest places", () => {
    const r = computeStandings(
      input({
        teams: [
          { id: "a", name: "A", hidden: false },
          { id: "z", name: "Z", hidden: true },
        ],
        tasks: [task("k", { kind: "contest", contestPlaces: 1, points: 100, minPoints: 100 })],
        submissions: [sub("z", "k", min(1), { contestValue: 999 }), sub("a", "k", min(2), { contestValue: 5 })],
      }),
    );
    expect(byTeam(r).a.contestPoints).toBe(100);
    expect(byTeam(r).z.contestPoints).toBe(0);
  });

  test("submissions for unknown teams or tasks are ignored", () => {
    const r = computeStandings(
      input({ tasks: [task("t1")], submissions: [sub("ghost", "t1", min(1)), sub("a", "missing", min(1))] }),
    );
    expect(r.standings.every((s) => s.total === 0)).toBe(true);
    expect(r.tasks.t1.solves).toBe(0);
  });

  test("negative totals rank below teams with zero", () => {
    const r = computeStandings(input({ adjustments: [{ teamId: "c", points: -5, at: min(1) }] }));
    expect(r.standings.at(-1)?.teamId).toBe("c");
    expect(byTeam(r).c.rank).toBe(3);
  });

  test("equal totals reached at the same moment share a rank", () => {
    const r = computeStandings(
      input({ tasks: [task("t1")], submissions: [sub("a", "t1", min(3)), sub("b", "t1", min(3))] }),
    );
    expect(byTeam(r).a.rank).toBe(1);
    expect(byTeam(r).b.rank).toBe(1);
    expect(byTeam(r).c.rank).toBe(3);
  });

  test("rarity value is shared even when solves arrive out of judging order", () => {
    const t = task("t1", { scoring: "rarity", points: 90, minPoints: 30, decaySolves: 4 });
    const r = computeStandings(
      input({
        tasks: [t],
        submissions: [sub("a", "t1", min(5), { judgedAt: min(1) }), sub("b", "t1", min(2), { judgedAt: min(9) })],
      }),
    );
    expect(byTeam(r).a.total).toBe(byTeam(r).b.total);
    expect(byTeam(r).a.total).toBe(decayValue(2, 90, 30, 4));
  });

  test("contest 'total' sums every approved entry of a team", () => {
    const k = task("k", { kind: "contest", contestRank: "total", contestPlaces: 2, points: 50, minPoints: 10 });
    const r = computeStandings(
      input({
        tasks: [k],
        submissions: [
          sub("a", "k", min(1), { contestValue: 3 }),
          sub("a", "k", min(2), { contestValue: 4 }),
          sub("b", "k", min(3), { contestValue: 6 }),
          sub("b", "k", min(4), { contestValue: 9, status: "rejected" }),
        ],
      }),
    );
    expect(r.tasks.k.contest?.map((e) => [e.teamId, e.value, e.points])).toEqual([
      ["a", 7, 50],
      ["b", 6, 10],
    ]);
  });
});
