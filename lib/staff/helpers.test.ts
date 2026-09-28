import { describe, expect, test } from "bun:test";
import { TASK_KINDS } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format";
import { decayValue, placementLadder } from "@/lib/scoring/engine";
import { HUNT_TEMPLATES, templateSummaries } from "@/lib/templates";
import { setupSteps } from "./checklist";
import { coursePoints, MAX_COURSE_CONTROLS } from "./course";
import { earningSubmissions } from "./earning";
import {
  curveLabel,
  curvePoints,
  curveValues,
  describeCurve,
  describeLadder,
  formatSchedule,
  scoringSummary,
  taskTiming,
} from "./format";
import { formLevel, linkish, tidySlug } from "./forms";
import { listSentence, parseLines, parseTeamNames, plainText, teamNameKey } from "./text";

describe("parseTeamNames", () => {
  test("trims, collapses spaces and drops blank lines", () => {
    const r = parseTeamNames("  Night   Owls \n\n\tLake Otters\r\n");
    expect(r.names).toEqual(["Night Owls", "Lake Otters"]);
    expect(r.repeated).toEqual([]);
  });

  test("reports names repeated in the list once, case-insensitively", () => {
    const r = parseTeamNames("Owls\nowls\nOWLS\nFoxes");
    expect(r.names).toEqual(["Owls", "Foxes"]);
    expect(r.repeated).toEqual(["owls"]);
  });

  test("rejects names over 32 characters", () => {
    const long = "The Extremely Long Team Name Of Doom";
    const r = parseTeamNames(`${long}\nShort`);
    expect(r.tooLong).toEqual([long]);
    expect(r.names).toEqual(["Short"]);
  });

  test("rejects one-character names", () => {
    const r = parseTeamNames("X\nFoxes");
    expect(r.tooShort).toEqual(["X"]);
    expect(r.names).toEqual(["Foxes"]);
  });

  test("team name keys ignore case and spacing", () => {
    expect(teamNameKey("  Night   OWLS ")).toBe(teamNameKey("night owls"));
  });
});

describe("parseLines and patterns", () => {
  test("keeps order and drops exact duplicates", () => {
    expect(parseLines("gargoyle\n gargoyles \ngargoyle\n\n")).toEqual(["gargoyle", "gargoyles"]);
  });

  test("markdown becomes a short plain line for notifications", () => {
    expect(plainText("**Clock tower** opens at [21:00](https://x.y).\n\n- Bring a torch")).toBe(
      "Clock tower opens at 21:00. Bring a torch",
    );
    expect(plainText("# Heads up\nControl _41_ unlocks soon")).toBe("Heads up. Control 41 unlocks soon");
    expect(plainText("a".repeat(300)).length).toBe(180);
  });

  test("list items and paragraphs stay separate sentences; wrapped lines join", () => {
    expect(plainText("The **finish** moved to the fountain.\n\n- Bring your phones\n- Be there by 21:00")).toBe(
      "The finish moved to the fountain. Bring your phones. Be there by 21:00",
    );
    expect(plainText("1. Go north\n2. Turn left!\n3. Look up")).toBe("Go north. Turn left! Look up");
    expect(plainText("Bring:\n- a torch\n- water")).toBe("Bring: a torch, water");
    expect(plainText("Meet at the\nfountain at 9")).toBe("Meet at the fountain at 9");
  });

  test("lists read naturally", () => {
    expect(listSentence(["A"])).toBe("A");
    expect(listSentence(["A", "B"])).toBe("A and B");
    expect(listSentence(["A", "B", "C"])).toBe("A, B and C");
  });
});

describe("scoring previews", () => {
  const race = { scoring: "race" as const, points: 150, minPoints: 60, decaySolves: 6 };

  test("curve follows the engine and ends at the minimum", () => {
    // Matches the worked example in docs/SCORING.md.
    expect(curveValues(race)).toEqual([150, 147, 136, 118, 93, 60]);
  });

  test("race and rarity summaries", () => {
    expect(describeCurve(race)).toBe("1st: 150, 2nd: 147 … 6th+: 60");
    expect(describeCurve({ ...race, scoring: "rarity" })).toBe(
      "1 team: 150 each, 2 teams: 147 each … 6+ teams: 60 each",
    );
    expect(describeCurve({ ...race, decaySolves: 3 })).toBe("1st: 150, 2nd: 128, 3rd+: 60");
    expect(describeCurve({ ...race, scoring: "fixed" })).toBe("Every team that solves it earns 150.");
  });

  test("curves longer than 20 solves are sampled, with real solve counts down to the minimum", () => {
    const long = { scoring: "race" as const, points: 150, minPoints: 60, decaySolves: 30 };
    expect(describeCurve(long)).toBe("1st: 150, 2nd: 150 … 30th+: 60");
    expect(describeCurve({ ...long, scoring: "rarity" })).toBe(
      "1 team: 150 each, 2 teams: 150 each … 30+ teams: 60 each",
    );
    const points = curvePoints(long);
    expect(points.length).toBe(20);
    expect(points[0]).toEqual({ solves: 1, value: 150 });
    expect(points[points.length - 1]).toEqual({ solves: 30, value: 60 });
    for (const [i, p] of points.entries()) {
      expect(p.value).toBe(decayValue(p.solves, 150, 60, 30));
      if (i > 0) expect(p.solves).toBeGreaterThan(points[i - 1].solves);
    }
    // Every solve up to 20 gets its own point.
    expect(curvePoints({ ...long, decaySolves: 20 }).map((p) => p.solves)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect(curvePoints({ ...long, decaySolves: 999 }).at(-1)).toEqual({ solves: 999, value: 60 });
  });

  test("curve labels mark only the minimum with a plus", () => {
    expect(curveLabel("race", 3, false)).toBe("3rd");
    expect(curveLabel("race", 30, true)).toBe("30th+");
    expect(curveLabel("rarity", 1, false)).toBe("1 team");
    expect(curveLabel("rarity", 30, true)).toBe("30+ teams");
  });

  test("contest ladders", () => {
    expect(describeLadder({ points: 200, minPoints: 60, contestPlaces: 3 })).toBe("1st: 200, 2nd: 101, 3rd: 60");
    const long = describeLadder({ points: 100, minPoints: 10, contestPlaces: 10 });
    expect(long.startsWith("1st: 100, 2nd:")).toBe(true);
    expect(long.endsWith("10th: 10")).toBe(true);
  });

  test("list summaries", () => {
    const base = { contestPlaces: 3, contestRank: "highest" as const, decaySolves: 6 };
    expect(scoringSummary({ ...base, kind: "media", scoring: "fixed", points: 100, minPoints: 0 })).toEqual({
      value: "100",
      note: "Fixed",
    });
    expect(scoringSummary({ ...base, kind: "media", scoring: "race", points: 150, minPoints: 60 })).toEqual({
      value: "150–60",
      note: "Race",
    });
    expect(scoringSummary({ ...base, kind: "contest", scoring: "fixed", points: 200, minPoints: 60 })).toEqual({
      value: "200 / 101 / 60",
      note: "Top 3, highest wins",
    });
  });
});

describe("earningSubmissions", () => {
  const at = (min: number) => new Date(Date.UTC(2026, 8, 27, 19, min));
  const sub = (
    id: string,
    taskId: string,
    min: number,
    extra: Partial<Parameters<typeof earningSubmissions>[0][0]> = {},
  ) => ({
    id,
    taskId,
    taskKind: "media" as const,
    status: "approved" as const,
    createdAt: at(min),
    contestValue: null,
    ...extra,
  });

  test("a standard task's points belong to its first accepted submission", () => {
    const earning = earningSubmissions(
      [sub("late", "t1", 30), sub("rejected", "t1", 5, { status: "rejected" }), sub("first", "t1", 10)],
      () => undefined,
    );
    expect(earning.get("t1")).toBe("first");
  });

  test("a contest's points belong to the entry that set the place", () => {
    const contest = { taskKind: "contest" as const };
    const subs = [
      sub("ten", "c1", 5, { ...contest, contestValue: 10 }),
      sub("forty", "c1", 20, { ...contest, contestValue: 40 }),
    ];
    const entry = { teamId: "team", place: 1, value: 40, at: at(20).getTime(), points: 100 };
    expect(earningSubmissions(subs, () => entry).get("c1")).toBe("forty");
    // Totals: the entry that completed the total.
    expect(earningSubmissions(subs, () => ({ ...entry, value: 50 })).get("c1")).toBe("forty");
    // No ranked entry (hidden team, no value recorded): no points shown.
    expect(earningSubmissions(subs, () => undefined).has("c1")).toBe(false);
  });
});

describe("formatSchedule", () => {
  const start = new Date("2026-09-26T18:00:00Z");
  test("same day shows the end as a time", () => {
    expect(formatSchedule(start, new Date("2026-09-26T20:30:00Z"), "UTC")).toBe(
      `${formatDateTime(start, "UTC")}–20:30`,
    );
  });
  test("across midnight shows both dates", () => {
    const end = new Date("2026-09-27T01:00:00Z");
    expect(formatSchedule(start, end, "UTC")).toBe(`${formatDateTime(start, "UTC")} – ${formatDateTime(end, "UTC")}`);
  });
  test("start only and none", () => {
    expect(formatSchedule(start, null, "UTC").startsWith("Starts ")).toBe(true);
    expect(formatSchedule(null, null, "UTC")).toBe("No start or end time yet");
  });
  test("uses the hunt's time zone", () => {
    expect(formatSchedule(start, null, "Asia/Tokyo")).toContain("03:00");
  });
});

describe("taskTiming", () => {
  const now = new Date("2026-09-26T18:00:00Z");
  test("upcoming unlock and close today show just the time", () => {
    const t = taskTiming(
      { unlockAt: new Date("2026-09-26T19:30:00Z"), lockAt: new Date("2026-09-26T21:00:00Z") },
      "UTC",
      now,
    );
    expect(t).toEqual({ unlock: "Unlocks 19:30", close: "Closes 21:00", closed: false });
  });
  test("past unlocks disappear and past closes say closed", () => {
    const t = taskTiming(
      { unlockAt: new Date("2026-09-26T17:00:00Z"), lockAt: new Date("2026-09-26T17:30:00Z") },
      "UTC",
      now,
    );
    expect(t).toEqual({ unlock: null, close: "Closed 17:30", closed: true });
  });
  test("other days include the date", () => {
    const t = taskTiming({ unlockAt: new Date("2026-09-28T09:00:00Z"), lockAt: null }, "UTC", now);
    expect(t.unlock).toBe(`Unlocks ${formatDateTime(new Date("2026-09-28T09:00:00Z"), "UTC")}`);
  });
});

describe("coursePoints", () => {
  test("is deterministic and inside the drawing", () => {
    const a = coursePoints("KqSXKVi9HIsV6nRf", 12);
    const b = coursePoints("KqSXKVi9HIsV6nRf", 12);
    expect(a).toEqual(b);
    expect(a.controls).toHaveLength(12);
    for (const p of [a.start, ...a.controls]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
  });

  test("caps the number of controls", () => {
    expect(coursePoints("x", 400).controls).toHaveLength(MAX_COURSE_CONTROLS);
    expect(coursePoints("x", 0).controls).toHaveLength(0);
  });
});

describe("setupSteps", () => {
  const base = {
    huntId: "h1",
    status: "draft" as const,
    hasStart: false,
    hasEnd: false,
    scheduleText: "",
    taskCount: 0,
    checkpointCount: 0,
    helperCount: 0,
    inviteCount: 0,
    playerCount: 0,
    printedCheckpoints: 0,
  };

  test("a fresh draft has nothing done and no poster step", () => {
    const steps = setupSteps(base);
    expect(steps.map((s) => s.id)).toEqual(["tasks", "schedule", "judges", "publish", "share"]);
    expect(steps.every((s) => !s.done)).toBe(true);
  });

  test("checkpoint tasks add the poster step", () => {
    const steps = setupSteps({ ...base, taskCount: 12, checkpointCount: 2, printedCheckpoints: 2 });
    const posters = steps.find((s) => s.id === "posters");
    expect(posters?.done).toBe(true);
    expect(steps.find((s) => s.id === "tasks")?.done).toBe(true);
  });

  test("the poster step waits until every checkpoint is printed with its current code", () => {
    const steps = setupSteps({ ...base, taskCount: 12, checkpointCount: 3, printedCheckpoints: 1 });
    const posters = steps.find((s) => s.id === "posters");
    expect(posters?.done).toBe(false);
    expect(posters?.title).toBe("Print checkpoint posters");
    expect(posters?.detail.startsWith("1 of 3 printed")).toBe(true);
  });

  test("publishing and the first player tick off the last steps", () => {
    const steps = setupSteps({ ...base, status: "published", playerCount: 3, hasStart: true, hasEnd: true });
    expect(steps.find((s) => s.id === "publish")?.done).toBe(true);
    expect(steps.find((s) => s.id === "share")?.done).toBe(true);
    expect(steps.find((s) => s.id === "schedule")?.done).toBe(true);
  });
});

describe("templates", () => {
  test("every template is a complete, varied course", () => {
    expect(HUNT_TEMPLATES.map((t) => t.name)).toEqual([
      "Campus classic",
      "City photo rally",
      "Office party",
      "Kids’ garden hunt",
    ]);
    for (const t of HUNT_TEMPLATES) {
      expect(t.tasks.length).toBeGreaterThanOrEqual(8);
      expect(t.tasks.length).toBeLessThanOrEqual(12);
      const kinds = new Set(t.tasks.map((task) => task.kind));
      for (const kind of TASK_KINDS) expect(kinds.has(kind)).toBe(true);
      const modes = new Set(t.tasks.filter((task) => task.kind !== "contest").map((task) => task.scoring ?? "fixed"));
      expect(modes.size).toBeGreaterThanOrEqual(2);
      expect(t.tasks.some((task) => (task.hints ?? []).length > 0)).toBe(true);
      expect(new Set(t.tasks.map((task) => task.title)).size).toBe(t.tasks.length);
    }
  });

  test("template scoring is valid", () => {
    for (const t of HUNT_TEMPLATES) {
      for (const task of t.tasks) {
        expect(task.points).toBeGreaterThan(0);
        expect(task.minPoints ?? 0).toBeLessThanOrEqual(task.points);
        if (task.scoring === "race" || task.scoring === "rarity")
          expect(task.decaySolves ?? 10).toBeGreaterThanOrEqual(2);
        if (task.kind === "contest") {
          const places = task.contestPlaces ?? 3;
          expect(places).toBeGreaterThanOrEqual(1);
          expect(placementLadder(places, task.points, task.minPoints ?? 0)[0]).toBe(task.points);
        }
        for (const hint of task.hints ?? []) expect(hint.cost).toBeGreaterThanOrEqual(0);
        expect(task.description).not.toMatch(/!/);
      }
    }
  });

  test("summaries count task kinds", () => {
    const campus = templateSummaries().find((s) => s.id === "campus");
    expect(campus?.taskCount).toBe(11);
    expect(campus?.kinds.checkpoint).toBe(2);
  });
});

describe("form helpers", () => {
  test("form-level messages hide when every error already shows at its field", () => {
    const single = { ok: false as const, error: "Enter a title.", fieldErrors: { title: "Enter a title." } };
    expect(formLevel(single, ["title"])).toBeNull();
    // An error about a field that isn't shown inline still reaches the organizer.
    expect(formLevel(single, ["code"])).toBe(single);
    const taken = {
      ok: false as const,
      error: "That link is taken.",
      fieldErrors: { slug: "Another hunt already uses this link.", "slug.suggestion": "campus-2" },
    };
    expect(formLevel(taken, ["slug"])).toBeNull();
    const formOnly = { ok: false as const, error: "This task no longer exists." };
    expect(formLevel(formOnly, ["title"])).toBe(formOnly);
    const success = { ok: true as const, message: "Saved." };
    expect(formLevel(success, ["title"])).toBe(success);
    expect(formLevel(null, ["title"])).toBeNull();
  });

  test("links stay link-shaped while typing and tidy up afterwards", () => {
    expect(linkish("Campus Hunt!")).toBe("campus-hunt-");
    expect(tidySlug("--campus--hunt-")).toBe("campus-hunt");
    expect(tidySlug(linkish("Night  Owls 2026"))).toBe("night-owls-2026");
  });
});
