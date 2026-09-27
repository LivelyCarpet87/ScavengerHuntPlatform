import { and, eq, gt, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { type Hunt, hunts, tasks } from "@/lib/db/schema";
import { type HuntPhase, huntPhase } from "@/lib/hunts";

/*
 * Time-driven hunt moments — a task unlocking, the start gun, the freeze,
 * the finish — detected by the background jobs in ./jobs.ts. Pure decision
 * logic lives here (unit-tested); jobs.ts does the publishing and pushing.
 */

export type HuntClock = Pick<Hunt, "id" | "slug" | "name" | "status" | "startsAt" | "endsAt" | "freezeAt">;

/** What a hunt looked like at one check. */
export type HuntObservation = { phase: HuntPhase; frozen: boolean };

export function observeHunt(
  hunt: Pick<Hunt, "status" | "startsAt" | "endsAt" | "freezeAt">,
  now: Date,
): HuntObservation {
  const phase = huntPhase(hunt, now);
  return { phase, frozen: phase === "live" && !!hunt.freezeAt && now >= hunt.freezeAt };
}

export type HuntMoment = {
  /** Something players can see changed: boards and task lists should refresh. */
  changed: boolean;
  /** Tell every player's phone. */
  announce: "started" | "ended" | null;
};

/**
 * Compares two observations of the same hunt. The first observation of a
 * hunt (server boot, newly published) never announces anything, so restarts
 * don't send duplicate pushes. An organizer moving the clock (e.g. extending
 * the end) still refreshes the boards, and a hunt that jumps straight from
 * upcoming to ended only announces the end.
 */
export function huntMoment(prev: HuntObservation | undefined, next: HuntObservation): HuntMoment {
  if (!prev) return { changed: false, announce: null };
  const changed = prev.phase !== next.phase || prev.frozen !== next.frozen;
  let announce: HuntMoment["announce"] = null;
  if (next.phase === "live" && prev.phase === "upcoming") announce = "started";
  if (next.phase === "ended" && (prev.phase === "live" || prev.phase === "upcoming")) announce = "ended";
  return { changed, announce };
}

export type UnlockedTask = {
  taskId: string;
  code: number;
  title: string;
  unlockAt: Date;
  hunt: Pick<Hunt, "id" | "slug" | "name" | "status" | "startsAt" | "endsAt">;
};

/** Visible tasks whose unlock time passed in (since, now], in published hunts that are live right now. */
export async function findUnlockedTasks(since: Date, now: Date): Promise<UnlockedTask[]> {
  if (now <= since) return [];
  const rows = await db
    .select({
      taskId: tasks.id,
      code: tasks.code,
      title: tasks.title,
      unlockAt: tasks.unlockAt,
      huntId: hunts.id,
      slug: hunts.slug,
      name: hunts.name,
      status: hunts.status,
      startsAt: hunts.startsAt,
      endsAt: hunts.endsAt,
    })
    .from(tasks)
    .innerJoin(hunts, eq(hunts.id, tasks.huntId))
    .where(
      and(eq(tasks.hidden, false), gt(tasks.unlockAt, since), lte(tasks.unlockAt, now), eq(hunts.status, "published")),
    )
    .orderBy(tasks.huntId, tasks.unlockAt, tasks.code);
  return rows
    .filter((r) => r.unlockAt && huntPhase(r, now) === "live")
    .map((r) => ({
      taskId: r.taskId,
      code: r.code,
      title: r.title,
      unlockAt: r.unlockAt as Date,
      hunt: { id: r.huntId, slug: r.slug, name: r.name, status: r.status, startsAt: r.startsAt, endsAt: r.endsAt },
    }));
}

/** Groups unlocked tasks by hunt, keeping each hunt's tasks in unlock order. */
export function groupByHunt(unlocked: UnlockedTask[]): Map<string, UnlockedTask[]> {
  const out = new Map<string, UnlockedTask[]>();
  for (const task of unlocked) {
    const list = out.get(task.hunt.id) ?? [];
    list.push(task);
    out.set(task.hunt.id, list);
  }
  return out;
}

/** Push copy for newly opened tasks: "Clock tower (41) is open". */
export function unlockMessage(list: Pick<UnlockedTask, "code" | "title">[]): { title: string; body: string } {
  const label = (t: Pick<UnlockedTask, "code" | "title">) => `${t.title} (${t.code})`;
  if (list.length === 1) return { title: "New task unlocked", body: `${label(list[0])} is open` };
  if (list.length === 2)
    return { title: "New tasks unlocked", body: `${label(list[0])} and ${label(list[1])} are open` };
  const more = list.length - 2;
  return {
    title: "New tasks unlocked",
    body: `${label(list[0])}, ${label(list[1])} and ${more} more are open`,
  };
}

/** Published hunts with a schedule — the only ones that can start, freeze or end on their own. */
export async function loadHuntClocks(): Promise<HuntClock[]> {
  return db
    .select({
      id: hunts.id,
      slug: hunts.slug,
      name: hunts.name,
      status: hunts.status,
      startsAt: hunts.startsAt,
      endsAt: hunts.endsAt,
      freezeAt: hunts.freezeAt,
    })
    .from(hunts)
    .where(eq(hunts.status, "published"));
}
