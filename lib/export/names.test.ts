import { describe, expect, test } from "bun:test";
import { exportFilename, mediaEntryNames, safeExt, safeSlug } from "./names";

describe("safeSlug", () => {
  test("lowercases, strips accents and punctuation", () => {
    expect(safeSlug("The red door", "task")).toBe("the-red-door");
    expect(safeSlug("Tomás & Ada’s crew!", "team")).toBe("tomas-ada-s-crew");
    expect(safeSlug("  --Night   Owls--  ", "team")).toBe("night-owls");
  });

  test("falls back for names with no letters or digits", () => {
    expect(safeSlug("🦉🦉", "team")).toBe("team");
    expect(safeSlug("", "task")).toBe("task");
  });

  test("never ends with a dash after truncating", () => {
    expect(safeSlug("aaaa bbbb", "x", 5)).toBe("aaaa");
  });
});

describe("safeExt", () => {
  test("normalizes extensions", () => {
    expect(safeExt("JPEG")).toBe("jpg");
    expect(safeExt("mp4")).toBe("mp4");
    expect(safeExt("../../x")).toBe("x");
    expect(safeExt("")).toBe("bin");
  });
});

describe("mediaEntryNames", () => {
  const base = { taskId: "t31", taskCode: 31, taskTitle: "The red door" };

  test("names files <code>-<task>/<team>-<n>.<ext> and numbers per team and task", () => {
    expect(
      mediaEntryNames([
        { ...base, teamId: "a", teamName: "Night Owls", ext: "jpeg" },
        { ...base, teamId: "a", teamName: "Night Owls", ext: "mp4" },
        { ...base, teamId: "b", teamName: "Lake Otters", ext: "png" },
        {
          taskId: "t35",
          taskCode: 35,
          taskTitle: "Tallest human tower",
          teamId: "a",
          teamName: "Night Owls",
          ext: "mov",
        },
      ]),
    ).toEqual([
      "31-the-red-door/night-owls-1.jpg",
      "31-the-red-door/night-owls-2.mp4",
      "31-the-red-door/lake-otters-1.png",
      "35-tallest-human-tower/night-owls-1.mov",
    ]);
  });

  test("keeps teams whose names slug the same apart", () => {
    expect(
      mediaEntryNames([
        { ...base, teamId: "a", teamName: "Night Owls", ext: "jpg" },
        { ...base, teamId: "b", teamName: "night owls!", ext: "jpg" },
        { ...base, teamId: "a", teamName: "Night Owls", ext: "jpg" },
      ]),
    ).toEqual([
      "31-the-red-door/night-owls-1.jpg",
      "31-the-red-door/night-owls-2-1.jpg",
      "31-the-red-door/night-owls-2.jpg",
    ]);
  });

  test("uses fallbacks for emoji-only names", () => {
    expect(mediaEntryNames([{ ...base, taskTitle: "🌙", teamId: "a", teamName: "🦉", ext: "jpg" }])).toEqual([
      "31-task/team-1.jpg",
    ]);
  });

  test("every name is unique", () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      ...base,
      teamId: `t${i % 4}`,
      teamName: i % 2 ? "Same" : "same",
      ext: "jpg",
    }));
    const names = mediaEntryNames(items);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("exportFilename", () => {
  test("prefixes the hunt slug", () => {
    expect(exportFilename("campus-night-hunt", "standings.csv")).toBe("campus-night-hunt-standings.csv");
  });
});
