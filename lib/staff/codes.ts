import "server-only";
import { and, eq, max, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { hunts, tasks, teams } from "@/lib/db/schema";
import { newCode, newJoinCode } from "@/lib/ids";
import { FIRST_TASK_CODE } from "@/lib/templates";

/*
 * Unique codes and slugs for organizer actions. Every generator checks the
 * database first; callers still catch unique-constraint errors (two
 * organizers can race) with isUniqueViolation().
 */

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const TASK_CODE_MAX = 999;

/** True for a SQLite UNIQUE violation, optionally on a given "table.column". */
export function isUniqueViolation(err: unknown, target?: string): boolean {
  let e: unknown = err;
  for (let depth = 0; e && depth < 5; depth += 1) {
    const msg = String((e as { message?: unknown }).message ?? "");
    if (/UNIQUE constraint failed/i.test(msg) && (!target || msg.includes(target))) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

export async function slugTaken(slug: string, exceptHuntId?: string): Promise<boolean> {
  const row = await db
    .select({ id: hunts.id })
    .from(hunts)
    .where(exceptHuntId ? and(eq(hunts.slug, slug), ne(hunts.id, exceptHuntId)) : eq(hunts.slug, slug))
    .get();
  return !!row;
}

/** `base` if it's free, otherwise base-2, base-3 … */
export async function freeSlug(base: string, exceptHuntId?: string): Promise<string> {
  const stem = base.slice(0, 44).replace(/-+$/, "") || "hunt";
  if (!(await slugTaken(stem, exceptHuntId))) return stem;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${stem}-${i}`;
    if (!(await slugTaken(candidate, exceptHuntId))) return candidate;
  }
  return `${stem}-${newCode(4).toLowerCase()}`;
}

export async function uniqueJoinCode(): Promise<string> {
  for (let i = 0; i < 60; i += 1) {
    const code = newJoinCode();
    const row = await db.select({ id: hunts.id }).from(hunts).where(eq(hunts.joinCode, code)).get();
    if (!row) return code;
  }
  throw new Error("Couldn’t find a free hunt code. Try again.");
}

/** A team code that isn't used in the hunt (or in `alsoTaken`, for bulk creation). */
export async function uniqueTeamCode(huntId: string, alsoTaken: Set<string> = new Set()): Promise<string> {
  const rows = await db.select({ code: teams.code }).from(teams).where(eq(teams.huntId, huntId));
  const taken = new Set([...rows.map((r) => r.code), ...alsoTaken]);
  for (let i = 0; i < 200; i += 1) {
    const code = newCode(6);
    if (!taken.has(code)) return code;
  }
  throw new Error("Couldn’t find a free team code. Try again.");
}

export async function uniqueCheckpointCode(huntId: string, alsoTaken: Set<string> = new Set()): Promise<string> {
  const rows = await db.select({ code: tasks.checkpointCode }).from(tasks).where(eq(tasks.huntId, huntId));
  const taken = new Set([...rows.map((r) => r.code).filter((c): c is string => !!c), ...alsoTaken]);
  for (let i = 0; i < 200; i += 1) {
    const code = newCode(6);
    if (!taken.has(code)) return code;
  }
  throw new Error("Couldn’t find a free checkpoint code. Try again.");
}

/** The code after the highest one in use (at least 31). */
export async function nextTaskCode(huntId: string): Promise<number> {
  const row = await db
    .select({ top: max(tasks.code) })
    .from(tasks)
    .where(eq(tasks.huntId, huntId))
    .get();
  const next = Math.max(FIRST_TASK_CODE, (row?.top ?? FIRST_TASK_CODE - 1) + 1);
  if (next <= TASK_CODE_MAX) return next;
  // Codes are exhausted at the top; fall back to the lowest free one.
  const used = new Set(
    (await db.select({ code: tasks.code }).from(tasks).where(eq(tasks.huntId, huntId))).map((r) => r.code),
  );
  for (let c = FIRST_TASK_CODE; c <= TASK_CODE_MAX; c += 1) if (!used.has(c)) return c;
  for (let c = 1; c < FIRST_TASK_CODE; c += 1) if (!used.has(c)) return c;
  return TASK_CODE_MAX;
}
