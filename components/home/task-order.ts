import type { TaskRowData } from "./task-list";

/*
 * The order of the hunt home's task list. Pure (no React, no server imports),
 * so the client list uses it and it is unit-tested directly.
 */

type RowOrderFields = Pick<TaskRowData, "bucket" | "category">;

/** Where a row goes within its category while the hunt runs: open tasks first, closed ones last. */
const NEXT_STEP: Record<NonNullable<TaskRowData["bucket"]> | "closed", number> = {
  todo: 0,
  review: 1,
  done: 2,
  closed: 3,
};

/**
 * Rows by what the team can do with them next: to do (including a rejected
 * try that can be sent again), then in review, then done, then closed. The
 * sort is stable, so the organizer's order holds within each.
 */
export function byNextStep<T extends RowOrderFields>(rows: T[]): T[] {
  return [...rows].sort((a, b) => NEXT_STEP[a.bucket ?? "closed"] - NEXT_STEP[b.bucket ?? "closed"]);
}

/**
 * Rows grouped by category, categories in the organizer's order and
 * uncategorized tasks last under "More tasks". With `nextStepFirst` (while the
 * hunt runs), each category lists its rows by byNextStep.
 */
export function groupByCategory<T extends RowOrderFields>(
  rows: T[],
  nextStepFirst = false,
): { name: string | null; rows: T[] }[] {
  const order = nextStepFirst ? byNextStep<T> : (list: T[]) => list;
  if (!rows.some((r) => r.category)) return [{ name: null, rows: order(rows) }];
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const key = r.category ?? "";
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const named = [...groups.entries()].filter(([k]) => k !== "");
  const rest = groups.get("");
  return [
    ...named.map(([name, list]) => ({ name, rows: order(list) })),
    ...(rest ? [{ name: "More tasks", rows: order(rest) }] : []),
  ];
}
