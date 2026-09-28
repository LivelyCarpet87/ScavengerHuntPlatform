import { describe, expect, test } from "bun:test";
import { computeStandings, type EngineInput } from "@/lib/scoring/engine";
import { pointsForSubmissions, toRows } from "./shape";

const task = (id: string, kind: "media" | "contest" = "media") => ({
  id,
  kind,
  scoring: "fixed" as const,
  points: kind === "contest" ? 200 : 100,
  minPoints: 60,
  decaySolves: 5,
  contestRank: "highest" as const,
  contestPlaces: 3,
});

const input: EngineInput = {
  teams: [
    { id: "owls", name: "Night Owls", hidden: false },
    { id: "otters", name: "Lake Otters", hidden: false },
    { id: "staff", name: "Staff test run", hidden: true },
  ],
  tasks: [task("t31"), task("t35", "contest")],
  submissions: [
    {
      id: "s1",
      taskId: "t31",
      teamId: "owls",
      status: "approved",
      submittedAt: 1000,
      judgedAt: 1100,
      pointsOverride: null,
      contestValue: null,
    },
    {
      id: "s2",
      taskId: "t31",
      teamId: "owls",
      status: "approved",
      submittedAt: 5000,
      judgedAt: 5100,
      pointsOverride: null,
      contestValue: null,
    },
    {
      id: "s3",
      taskId: "t35",
      teamId: "otters",
      status: "approved",
      submittedAt: 2000,
      judgedAt: 2100,
      pointsOverride: null,
      contestValue: 150,
    },
    {
      id: "s4",
      taskId: "t35",
      teamId: "otters",
      status: "approved",
      submittedAt: 3000,
      judgedAt: 3100,
      pointsOverride: null,
      contestValue: 180,
    },
    {
      id: "s5",
      taskId: "t31",
      teamId: "staff",
      status: "approved",
      submittedAt: 900,
      judgedAt: 950,
      pointsOverride: null,
      contestValue: null,
    },
  ],
  hintUnlocks: [],
  adjustments: [],
};
const result = computeStandings(input);
const teams = {
  owls: { id: "owls", name: "Night Owls", emoji: "🦉", color: "plum", hidden: false },
  otters: { id: "otters", name: "Lake Otters", emoji: "🦦", color: "lake", hidden: false },
  staff: { id: "staff", name: "Staff test run", emoji: "🐢", color: "slate", hidden: true },
};

describe("toRows", () => {
  test("hidden teams never reach players or the public", () => {
    const rows = toRows({ ...result, teams }, { isStaff: false, isPlayer: true });
    expect(rows.map((r) => r.teamId)).toEqual(["otters", "owls"]);
    expect(rows.every((r) => !r.hidden)).toBe(true);
  });

  test("staff see hidden teams last, without a rank", () => {
    const rows = toRows({ ...result, teams }, { isStaff: true, isPlayer: false });
    expect(rows.map((r) => [r.teamId, r.rank])).toEqual([
      ["otters", 1],
      ["owls", 2],
      ["staff", null],
    ]);
  });

  test("carries the display fields", () => {
    const [first] = toRows({ ...result, teams }, { isStaff: false, isPlayer: false });
    expect(first).toEqual({
      rank: 1,
      teamId: "otters",
      name: "Lake Otters",
      emoji: "🦦",
      color: "lake",
      total: 200,
      solved: 0,
      placements: 1,
      hidden: false,
    });
  });

  test("skips standings for teams that no longer exist", () => {
    const rows = toRows({ ...result, teams: { owls: teams.owls } }, { isStaff: true, isPlayer: false });
    expect(rows.map((r) => r.teamId)).toEqual(["owls"]);
  });
});

describe("pointsForSubmissions", () => {
  const newestFirst = [
    { id: "s2", teamId: "owls", taskId: "t31", taskKind: "media" as const, submittedAt: 5000 },
    { id: "s4", teamId: "otters", taskId: "t35", taskKind: "contest" as const, submittedAt: 3000 },
    { id: "s3", teamId: "otters", taskId: "t35", taskKind: "contest" as const, submittedAt: 2000 },
    { id: "s1", teamId: "owls", taskId: "t31", taskKind: "media" as const, submittedAt: 1000 },
  ];

  test("a task's points go on the solve, repeats show none", () => {
    const points = pointsForSubmissions(newestFirst, result);
    expect(points.get("s1")).toBe(100);
    expect(points.get("s2")).toBeNull();
  });

  test("contest points sit on the team's newest accepted entry", () => {
    const points = pointsForSubmissions(newestFirst, result);
    expect(points.get("s4")).toBe(200);
    expect(points.get("s3")).toBeNull();
  });

  test("nothing counted yet (e.g. after the freeze cutoff), no points", () => {
    const frozen = computeStandings({ ...input, cutoff: 500 });
    const points = pointsForSubmissions(newestFirst, frozen);
    expect([...points.values()].every((p) => p === null)).toBe(true);
  });
});
