import { describe, expect, test } from "bun:test";
import { galleryPage, groupGallery, parsePage } from "./gallery-groups";
import type { GalleryItem } from "./types";

const team = (id: string, name: string) => ({ id, name, emoji: "🦔", color: "forest" });
const task = (id: string, code: number) => ({ id, code, title: `Task ${code}`, kind: "media" as const });

function item(id: string, t: ReturnType<typeof task>, tm: ReturnType<typeof team>, kind: "image" | "video" = "image") {
  return {
    id,
    kind,
    thumb: null,
    display: null,
    original: `/files/${id}`,
    width: null,
    height: null,
    submissionId: `s-${id}`,
    at: "2026-09-28T10:00:00.000Z",
    team: tm,
    task: t,
  } satisfies GalleryItem;
}

const otters = team("t1", "Otters");
const badgers = team("t2", "Badgers");
const door = task("k1", 31);
const bell = task("k2", 32);
const items = [
  item("a", door, otters),
  item("b", door, badgers),
  item("c", door, otters, "video"),
  item("d", bell, badgers),
  item("e", bell, otters),
];

describe("groupGallery", () => {
  test("by task keeps the loaded order and sums up each group", () => {
    const groups = groupGallery(items, "task");
    expect(groups.map((g) => g.key)).toEqual(["k1", "k2"]);
    expect(groups.map((g) => g.summary)).toEqual(["2 photos and 1 video", "2 photos"]);
    expect(groups.every((g) => !g.continued)).toBe(true);
  });

  test("by team sorts teams by name", () => {
    const groups = groupGallery(items, "team");
    expect(groups.map((g) => (g.by === "team" ? g.team.name : ""))).toEqual(["Badgers", "Otters"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["a", "c", "e"]);
  });
});

describe("galleryPage", () => {
  const groups = groupGallery(items, "task");

  test("one page when everything fits", () => {
    const page = galleryPage(groups, 1, 10);
    expect(page).toMatchObject({ page: 1, pages: 1 });
    expect(page.groups.flatMap((g) => g.items.map((i) => i.id))).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("cuts a group where the page ends and continues it on the next page", () => {
    const first = galleryPage(groups, 1, 2);
    expect(first.pages).toBe(3);
    expect(first.groups.map((g) => [g.key, g.items.map((i) => i.id), g.continued])).toEqual([
      ["k1", ["a", "b"], false],
    ]);
    const second = galleryPage(groups, 2, 2);
    expect(second.groups.map((g) => [g.key, g.items.map((i) => i.id), g.continued])).toEqual([
      ["k1", ["c"], true],
      ["k2", ["d"], false],
    ]);
    // The heading still describes the whole group.
    expect(second.groups[0].summary).toBe("2 photos and 1 video");
  });

  test("clamps out-of-range pages", () => {
    expect(galleryPage(groups, 9, 2).page).toBe(3);
    expect(galleryPage(groups, 0, 2).page).toBe(1);
    expect(galleryPage([], 3).groups).toEqual([]);
    expect(galleryPage([], 3).pages).toBe(1);
  });
});

describe("parsePage", () => {
  test("reads a positive integer, else 1", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage(["2", "5"])).toBe(2);
    for (const bad of [undefined, "", "0", "-2", "1.5", "abc"]) expect(parsePage(bad)).toBe(1);
  });
});
