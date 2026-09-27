import { describe, expect, test } from "bun:test";
import { byNextStep, groupByCategory } from "./task-order";

type Row = { id: string; bucket: "todo" | "review" | "done" | null; category: string | null };

const row = (id: string, bucket: Row["bucket"], category: string | null = null): Row => ({ id, bucket, category });
const ids = (rows: Row[]) => rows.map((r) => r.id);

describe("byNextStep", () => {
  test("to do, then in review, then done, then closed", () => {
    const rows = [row("a", "done"), row("b", null), row("c", "review"), row("d", "todo")];
    expect(ids(byNextStep(rows))).toEqual(["d", "c", "a", "b"]);
  });

  test("keeps the organizer's order within each step", () => {
    const rows = [row("a", "done"), row("b", "todo"), row("c", "done"), row("d", "todo"), row("e", "review")];
    expect(ids(byNextStep(rows))).toEqual(["b", "d", "e", "a", "c"]);
  });

  test("doesn't change the input", () => {
    const rows = [row("a", "done"), row("b", "todo")];
    byNextStep(rows);
    expect(ids(rows)).toEqual(["a", "b"]);
  });
});

describe("groupByCategory", () => {
  const rows = [
    row("31", "done", "Quad"),
    row("32", "done", "Quad"),
    row("33", "todo", "Riddles"),
    row("34", "todo", "Quad"),
    row("35", "review", null),
    row("36", "todo", null),
  ];

  test("keeps the organizer's category order, uncategorized last", () => {
    expect(groupByCategory(rows).map((g) => g.name)).toEqual(["Quad", "Riddles", "More tasks"]);
    expect(ids(groupByCategory(rows)[0].rows)).toEqual(["31", "32", "34"]);
  });

  test("next step first within each category while the hunt runs", () => {
    const groups = groupByCategory(rows, true);
    expect(groups.map((g) => g.name)).toEqual(["Quad", "Riddles", "More tasks"]);
    expect(ids(groups[0].rows)).toEqual(["34", "31", "32"]);
    expect(ids(groups[2].rows)).toEqual(["36", "35"]);
  });

  test("one unnamed group without categories", () => {
    const plain = [row("a", "done"), row("b", "todo")];
    expect(groupByCategory(plain, true)).toEqual([{ name: null, rows: [plain[1], plain[0]] }]);
  });
});
