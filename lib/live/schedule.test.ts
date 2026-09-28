import { describe, expect, test } from "bun:test";
import { groupByHunt, huntMoment, observeHunt, type UnlockedTask, unlockMessage } from "./schedule";

const MIN = 60_000;
const t0 = new Date("2026-09-27T18:00:00Z").getTime();
const at = (min: number) => new Date(t0 + min * MIN);

const hunt = {
  status: "published" as const,
  startsAt: at(0),
  endsAt: at(120),
  freezeAt: at(100),
};

describe("observeHunt", () => {
  test("tracks phase and freeze", () => {
    expect(observeHunt(hunt, at(-1))).toEqual({ phase: "upcoming", frozen: false });
    expect(observeHunt(hunt, at(0))).toEqual({ phase: "live", frozen: false });
    expect(observeHunt(hunt, at(100))).toEqual({ phase: "live", frozen: true });
    expect(observeHunt(hunt, at(120))).toEqual({ phase: "ended", frozen: false });
  });

  test("a hunt without a freeze never freezes", () => {
    expect(observeHunt({ ...hunt, freezeAt: null }, at(110)).frozen).toBe(false);
  });
});

describe("huntMoment", () => {
  const obs = (min: number) => observeHunt(hunt, at(min));

  test("the first observation never announces (restarts don't spam)", () => {
    expect(huntMoment(undefined, obs(5))).toEqual({ changed: false, announce: null });
    expect(huntMoment(undefined, obs(130))).toEqual({ changed: false, announce: null });
  });

  test("announces the start and the end", () => {
    expect(huntMoment(obs(-1), obs(0))).toEqual({ changed: true, announce: "started" });
    expect(huntMoment(obs(119), obs(121))).toEqual({ changed: true, announce: "ended" });
  });

  test("the freeze refreshes boards without a push", () => {
    expect(huntMoment(obs(99), obs(100))).toEqual({ changed: true, announce: null });
  });

  test("nothing happens between moments", () => {
    expect(huntMoment(obs(10), obs(11))).toEqual({ changed: false, announce: null });
    expect(huntMoment(obs(-30), obs(-29))).toEqual({ changed: false, announce: null });
    expect(huntMoment(obs(130), obs(131))).toEqual({ changed: false, announce: null });
  });

  test("jumping from upcoming straight to ended only announces the end", () => {
    expect(huntMoment(obs(-1), obs(125))).toEqual({ changed: true, announce: "ended" });
  });

  test("extending a finished hunt reopens the boards quietly, then ends again", () => {
    const extended = { ...hunt, endsAt: at(180) };
    const reopened = observeHunt(extended, at(130));
    expect(huntMoment(obs(125), reopened)).toEqual({ changed: true, announce: null });
    expect(huntMoment(reopened, observeHunt(extended, at(181)))).toEqual({ changed: true, announce: "ended" });
  });

  test("drafts and archived hunts don't announce", () => {
    const draft = observeHunt({ ...hunt, status: "draft" }, at(5));
    expect(huntMoment(obs(-1), draft).announce).toBeNull();
    const archived = observeHunt({ ...hunt, status: "archived" }, at(125));
    expect(huntMoment(obs(119), archived).announce).toBeNull();
  });
});

describe("unlockMessage", () => {
  const task = (code: number, title: string) => ({ code, title });

  test("one task", () => {
    expect(unlockMessage([task(41, "Clock tower")])).toEqual({
      title: "New task unlocked",
      body: "Clock tower (41) is open",
    });
  });

  test("two and more tasks", () => {
    expect(unlockMessage([task(41, "Clock tower"), task(43, "Moon gate")]).body).toBe(
      "Clock tower (41) and Moon gate (43) are open",
    );
    const many = unlockMessage([task(41, "Clock tower"), task(43, "Moon gate"), task(44, "Pier"), task(45, "Bell")]);
    expect(many).toEqual({ title: "New tasks unlocked", body: "Clock tower (41), Moon gate (43) and 2 more are open" });
  });

  test("never uses a middle dot", () => {
    expect(unlockMessage([task(41, "Clock tower")]).body).not.toContain("·");
  });
});

describe("groupByHunt", () => {
  test("keeps each hunt's tasks together in order", () => {
    const h = (id: string) => ({ id, slug: id, name: id, status: "published" as const, startsAt: null, endsAt: null });
    const u = (taskId: string, huntId: string): UnlockedTask => ({
      taskId,
      code: 40,
      title: taskId,
      unlockAt: at(1),
      hunt: h(huntId),
    });
    const groups = groupByHunt([u("a", "h1"), u("b", "h2"), u("c", "h1")]);
    expect([...groups.keys()]).toEqual(["h1", "h2"]);
    expect(groups.get("h1")?.map((t) => t.taskId)).toEqual(["a", "c"]);
  });
});
