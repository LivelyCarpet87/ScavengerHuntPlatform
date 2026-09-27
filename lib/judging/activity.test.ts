import { describe, expect, test } from "bun:test";
import { type ActivityEntry, activityGroup, activityText, describeActivity, groupPrefixes } from "./activity";

const lookup = {
  teams: { tA: "Night Owls", tB: "Moss Collective" },
  tasks: { k31: { code: 31, title: "The red door" } },
  submissions: { s1: { teamId: "tA", taskId: "k31" } },
};
const opts = { huntId: "h1", actor: "Sam" };
const say = (entry: ActivityEntry) => activityText(describeActivity(entry, lookup, opts));

describe("judging sentences", () => {
  const decision = (verb: string, data: Record<string, unknown>): ActivityEntry => ({
    action: `submission.${verb}`,
    targetKind: "submission",
    targetId: "s1",
    data: { teamId: "tA", teamName: "Night Owls", taskId: "k31", taskCode: 31, taskTitle: "The red door", ...data },
  });

  test("approvals include the points", () => {
    const d = describeActivity(
      decision("approve", {
        points: 100,
        before: { status: "pending" },
        after: { status: "approved", feedback: "Great shot!" },
      }),
      lookup,
      opts,
    );
    expect(activityText(d)).toBe("Sam approved Night Owls’ submission for 31 The red door (+100)");
    expect(d.detail).toBe("“Great shot!”");
    expect(d.href).toBe("/manage/h1/submissions/s1");
    expect(d.tone).toBe("approved");
    expect(d.group).toBe("judging");
  });

  test("possessives for names not ending in s", () => {
    expect(
      activityText(
        describeActivity(
          {
            action: "submission.reject",
            targetKind: "submission",
            targetId: "s1",
            data: {
              teamName: "Moss Collective",
              taskCode: 31,
              taskTitle: "The red door",
              before: { status: "pending" },
            },
          },
          lookup,
          opts,
        ),
      ),
    ).toBe("Sam rejected Moss Collective’s submission for 31 The red door");
  });

  test("re-judging reads as a change", () => {
    expect(say(decision("reject", { before: { status: "approved" }, after: { status: "rejected" } }))).toBe(
      "Sam changed Night Owls’ submission for 31 The red door to not accepted",
    );
    expect(
      say(decision("approve", { points: 60, before: { status: "rejected" }, after: { status: "approved" } })),
    ).toBe("Sam changed Night Owls’ submission for 31 The red door to accepted (+60)");
    expect(
      say(
        decision("approve", {
          points: 70,
          before: { status: "approved", pointsOverride: null },
          after: { status: "approved", pointsOverride: 70 },
        }),
      ),
    ).toBe("Sam changed the points on Night Owls’ submission for 31 The red door (+70)");
  });

  test("re-saving an accepted submission says what changed", () => {
    const accepted = { status: "approved", pointsOverride: null, contestValue: null };
    expect(
      say(
        decision("approve", {
          points: 100,
          before: { ...accepted, feedback: null },
          after: { ...accepted, feedback: "Nice angle" },
        }),
      ),
    ).toBe("Sam updated the feedback on Night Owls’ submission for 31 The red door (+100)");
    expect(
      say(
        decision("approve", {
          points: 100,
          before: { ...accepted, feedback: "Hi" },
          after: { ...accepted, feedback: "Hi" },
        }),
      ),
    ).toBe("Sam confirmed Night Owls’ submission for 31 The red door (+100)");
    const measured = describeActivity(
      decision("approve", {
        points: 101,
        before: { ...accepted, contestValue: 180 },
        after: { ...accepted, contestValue: 185 },
      }),
      lookup,
      opts,
    );
    expect(activityText(measured)).toBe(
      "Sam changed the measured value on Night Owls’ submission for 31 The red door (+101)",
    );
    expect(measured.detail).toBe("Now 185");
  });

  test("reverts and deletes", () => {
    expect(say(decision("revert", {}))).toBe("Sam put Night Owls’ submission for 31 The red door back in review");
    const deleted = describeActivity(decision("delete", { text: "hello" }), lookup, opts);
    expect(activityText(deleted)).toBe("Sam deleted Night Owls’ submission for 31 The red door");
    expect(deleted.href).toBeNull();
  });

  test("falls back to current names when data is missing", () => {
    expect(say({ action: "submission.approve", targetKind: "submission", targetId: "s1", data: null })).toBe(
      "Sam approved Night Owls’ submission for 31 The red door",
    );
  });
});

describe("score sentences", () => {
  test("bonuses and penalties", () => {
    const bonus = describeActivity(
      {
        action: "adjustment.create",
        targetKind: "adjustment",
        targetId: "a1",
        data: { teamId: "tB", teamName: "Moss Collective", points: 25, reason: "Helped another team" },
      },
      lookup,
      opts,
    );
    expect(activityText(bonus)).toBe("Sam gave Moss Collective a 25-point bonus (+25)");
    expect(bonus.detail).toBe("Helped another team");
    expect(bonus.group).toBe("scores");
    expect(
      say({
        action: "adjustment.delete",
        targetKind: "adjustment",
        targetId: "a2",
        data: { teamName: "Night Owls", points: -20, reason: "Ran" },
      }),
    ).toBe("Sam removed Night Owls’ 20-point penalty");
  });

  test("exports", () => {
    expect(say({ action: "export.download", targetKind: null, targetId: null, data: { kind: "media.zip" } })).toBe(
      "Sam downloaded the photos and videos",
    );
  });
});

describe("other areas’ actions", () => {
  test("team renames use before and after names", () => {
    const d = describeActivity(
      { action: "team.rename", targetKind: "team", targetId: "tA", data: { from: "Owls", to: "Night Owls" } },
      lookup,
      opts,
    );
    expect(activityText(d)).toBe("Sam renamed team Owls to Night Owls");
    expect(d.href).toBe("/manage/h1/teams/tA");
    expect(d.group).toBe("teams");
  });

  test("tasks and hunts", () => {
    expect(say({ action: "task.update", targetKind: "task", targetId: "k31", data: null })).toBe(
      "Sam updated task 31 The red door",
    );
    expect(
      say({ action: "task.delete", targetKind: "task", targetId: "gone", data: { code: 44, title: "Old bell" } }),
    ).toBe("Sam deleted task 44 Old bell");
    expect(say({ action: "hunt.publish", targetKind: "hunt", targetId: "h1", data: null })).toBe(
      "Sam published the hunt",
    );
    expect(say({ action: "hunt.update", targetKind: "hunt", targetId: "h1", data: null })).toBe(
      "Sam updated the hunt settings",
    );
  });

  test("unknown verbs and nouns still read", () => {
    expect(say({ action: "team.recolor", targetKind: "team", targetId: "tB", data: null })).toBe(
      "Sam changed team Moss Collective",
    );
    expect(say({ action: "gallery.feature", targetKind: null, targetId: null, data: null })).toBe(
      "Sam changed gallery",
    );
  });
});

describe("groups", () => {
  test("classifies by prefix with settings as the catch-all", () => {
    expect(activityGroup("submission.approve")).toBe("judging");
    expect(activityGroup("adjustment.delete")).toBe("scores");
    expect(activityGroup("player.remove")).toBe("teams");
    expect(activityGroup("hint.create")).toBe("tasks");
    expect(activityGroup("hunt.publish")).toBe("settings");
    expect(activityGroup("announcement.create")).toBe("settings");
    expect(groupPrefixes("judging")).toEqual({ include: ["submission."], exclude: [] });
    expect(groupPrefixes("settings").exclude).toContain("team.");
  });
});

describe("submission history wording", () => {
  test("compact sentences", async () => {
    const { describeSubmissionEvent } = await import("./activity");
    expect(
      describeSubmissionEvent({
        action: "submission.approve",
        data: { points: 100, before: { status: "pending" }, after: { feedback: "Nice" } },
      }),
    ).toEqual({ text: "approved it (+100)", detail: "“Nice”", tone: "approved" });
    expect(
      describeSubmissionEvent({ action: "submission.reject", data: { before: { status: "approved" } } }).text,
    ).toBe("changed it to not accepted");
    expect(describeSubmissionEvent({ action: "submission.revert", data: null }).text).toBe("put it back in review");
    expect(
      describeSubmissionEvent({
        action: "submission.approve",
        data: { points: 200, before: { status: "approved", pointsOverride: null }, after: { contestValue: 212 } },
      }),
    ).toEqual({ text: "changed the measured value (+200)", detail: "Measured 212", tone: "approved" });
  });
});

describe("payloads other areas write", () => {
  const e = (action: string, targetKind: string | null, targetId: string | null, data: Record<string, unknown>) =>
    say({ action, targetKind, targetId, data });

  test("teams and players", () => {
    expect(e("team.update", "team", "tA", { name: { from: "Owls", to: "Night Owls" } })).toBe(
      "Sam renamed team Owls to Night Owls",
    );
    expect(e("team.update", "team", "tA", { hidden: true })).toBe("Sam hid team Night Owls from the scoreboard");
    expect(e("team.code", "team", "tA", { from: "AAA", to: "BBB" })).toBe("Sam gave team Night Owls a new team code");
    expect(e("team.bulk_create", "team", null, { count: 2, names: ["A", "B"] })).toBe("Sam created 2 teams");
    expect(e("team.delete", "team", "gone", { name: "Rust Buckets", submissions: 3 })).toBe(
      "Sam deleted team Rust Buckets",
    );
    expect(e("player.move", "player", "p1", { name: "Priya", from: "tB", to: "tA" })).toBe(
      "Sam moved Priya to Night Owls",
    );
    expect(e("player.remove", "player", "p1", { name: "Priya", teamId: "tA" })).toBe(
      "Sam removed Priya from Night Owls",
    );
    expect(e("player.captain", "player", "p1", { name: "Priya", teamId: "tA" })).toBe(
      "Sam made Priya captain of Night Owls",
    );
    expect(e("player.rename", "player", "p1", { from: "Pri", to: "Priya" })).toBe("Sam renamed player Pri to Priya");
  });

  test("tasks and hints", () => {
    const d = describeActivity(
      {
        action: "task.update",
        targetKind: "task",
        targetId: "k31",
        data: { code: 31, title: "The red door", changed: ["points", "unlockAt"], points: { from: 100, to: 120 } },
      },
      lookup,
      opts,
    );
    expect(activityText(d)).toBe("Sam updated task 31 The red door");
    expect(d.detail).toBe("Changed points (100 to 120), unlock at.");
    expect(e("task.reorder", "task", "k31", { direction: "up" })).toBe("Sam moved task 31 The red door up the list");
    expect(e("hint.update", "hint", "h1", { taskId: "k31", cost: { from: 10, to: 15 } })).toBe(
      "Sam changed a hint for 31 The red door",
    );
    expect(e("task.attach", "file", "f1", { taskId: "k31", name: "map.pdf" })).toBe(
      "Sam attached map.pdf to task 31 The red door",
    );
  });

  test("hunt, staff and announcements", () => {
    expect(e("hunt.schedule", "hunt", "h1", {})).toBe("Sam changed the hunt’s schedule");
    expect(e("hunt.feedback_templates", "hunt", "h1", {})).toBe("Sam updated the saved replies for judges");
    expect(e("staff.role", "user", "u2", { name: "Sam Okafor", from: "judge", to: "organizer" })).toBe(
      "Sam changed Sam Okafor’s role from judge to organizer",
    );
    expect(e("invite.accept", "invite", "i1", { role: "judge" })).toBe(
      "Sam joined the staff as a judge with an invite link",
    );
    const a = describeActivity(
      { action: "announcement.create", targetKind: "announcement", targetId: "a1", data: { title: "Clock tower" } },
      lookup,
      opts,
    );
    expect(activityText(a)).toBe("Sam posted an announcement");
    expect(a.detail).toBe("“Clock tower”");
    expect(e("print.team-cards", null, null, {})).toBe("Sam printed the team cards");
    expect(e("print.poster", null, null, {})).toBe("Sam printed the join poster");
    expect(e("invite.create", "invite", "i2", { role: "organizer" })).toBe(
      "Sam created an invite link for an organizer",
    );
  });
});
