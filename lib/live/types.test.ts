import { describe, expect, test } from "bun:test";
import { describeMedia, describeProgress, isBoardEmpty, isTied, rankMovement, rankSnapshot } from "./types";

describe("rankMovement", () => {
  const rows = [
    { teamId: "a", rank: 1 },
    { teamId: "b", rank: 2 },
    { teamId: "c", rank: 3 },
    { teamId: "hidden", rank: null },
  ];

  test("positive means the team climbed", () => {
    expect(rankMovement({ a: 2, b: 1, c: 3 }, rows)).toEqual({ a: 1, b: -1 });
  });

  test("no baseline, no arrows", () => {
    expect(rankMovement(null, rows)).toEqual({});
    expect(rankMovement(undefined, rows)).toEqual({});
  });

  test("new and unranked teams get no arrow", () => {
    expect(rankMovement({ a: 1, hidden: 1 }, rows)).toEqual({});
  });

  test("snapshots skip unranked teams", () => {
    expect(rankSnapshot(rows)).toEqual({ a: 1, b: 2, c: 3 });
  });
});

describe("isTied", () => {
  const rows = [{ rank: 1 }, { rank: 2 }, { rank: 2 }, { rank: 4 }, { rank: null }, { rank: null }];
  test("marks both sides of a shared rank", () => {
    expect(rows.map((_, i) => isTied(rows, i))).toEqual([false, true, true, false, false, false]);
  });
});

describe("isBoardEmpty", () => {
  test("true only before anyone scores", () => {
    expect(isBoardEmpty([{ total: 0, solved: 0, placements: 0 }])).toBe(true);
    expect(isBoardEmpty([{ total: -10, solved: 0, placements: 0 }])).toBe(false);
    expect(isBoardEmpty([{ total: 0, solved: 1, placements: 0 }])).toBe(false);
    expect(isBoardEmpty([])).toBe(true);
  });
});

describe("describeProgress", () => {
  test("plain words, no middle dots", () => {
    expect(describeProgress({ solved: 0, placements: 0 })).toBe("No tasks yet");
    expect(describeProgress({ solved: 1, placements: 0 })).toBe("1 task");
    expect(describeProgress({ solved: 5, placements: 1 })).toBe("5 tasks, 1 contest place");
    expect(describeProgress({ solved: 0, placements: 2 })).toBe("2 contest places");
  });
});

describe("describeMedia", () => {
  const photo = { kind: "image" as const };
  const video = { kind: "video" as const };
  test("counts photos and videos separately", () => {
    expect(describeMedia([photo])).toBe("1 photo");
    expect(describeMedia([photo, photo, photo])).toBe("3 photos");
    expect(describeMedia([video])).toBe("1 video");
    expect(describeMedia([photo, photo, video])).toBe("2 photos and 1 video");
  });
  test("an adjective goes before the first noun only", () => {
    expect(describeMedia([photo, photo], "accepted")).toBe("2 accepted photos");
    expect(describeMedia([video, video], "accepted")).toBe("2 accepted videos");
    expect(describeMedia([photo, video, video], "accepted")).toBe("1 accepted photo and 2 videos");
  });
});
