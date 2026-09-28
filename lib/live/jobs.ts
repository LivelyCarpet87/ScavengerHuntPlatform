import "server-only";
import { registerJob } from "@/lib/jobs";
import { notifyHuntPlayers, type PushPayload } from "@/lib/push";
import { publish } from "@/lib/realtime/bus";
import { links } from "@/lib/url";
import {
  findUnlockedTasks,
  groupByHunt,
  type HuntObservation,
  huntMoment,
  loadHuntClocks,
  observeHunt,
  unlockMessage,
} from "./schedule";

/*
 * Background jobs for time-driven moments nobody clicks a button for:
 *
 *   task-unlocks     every 30 s: tasks whose unlock time just passed → tasks.changed + push
 *   hunt-start-end   every 15 s: start, freeze and finish → hunt.changed (+ push at start and end)
 *
 * State lives in memory (kept on globalThis across dev reloads). Checkpoints
 * start at boot, so a restart never re-announces what already happened.
 * Loaded from instrumentation.ts before startBackgroundJobs().
 */

type LiveJobsState = { unlockedUpTo: number; hunts: Map<string, HuntObservation>; ready: Promise<void> };
const g = globalThis as { __shpLiveJobs?: LiveJobsState };
const state: LiveJobsState = g.__shpLiveJobs ?? createState();
g.__shpLiveJobs = state;

function createState(): LiveJobsState {
  const bootedAt = new Date();
  const hunts = new Map<string, HuntObservation>();
  // Remember how every hunt looked at boot, so one that starts a few seconds
  // later is still announced, while anything that happened before is not.
  const ready = loadHuntClocks()
    .then((clocks) => {
      for (const hunt of clocks) if (!hunts.has(hunt.id)) hunts.set(hunt.id, observeHunt(hunt, bootedAt));
    })
    .catch((err) => console.error("[live-jobs] could not read hunt schedules", err));
  return { unlockedUpTo: bootedAt.getTime(), hunts, ready };
}

/** Push without holding up the job; a failing push service is logged, never retried. */
function push(huntId: string, payload: PushPayload) {
  notifyHuntPlayers(huntId, payload).catch((err) => console.error("[live-jobs] push failed", err));
}

export async function announceUnlockedTasks(now = new Date()): Promise<void> {
  const since = new Date(state.unlockedUpTo);
  const unlocked = await findUnlockedTasks(since, now);
  state.unlockedUpTo = now.getTime();
  for (const list of groupByHunt(unlocked).values()) {
    const { hunt } = list[0];
    publish(hunt.id, { type: "tasks.changed" });
    const single = list.length === 1;
    push(hunt.id, {
      ...unlockMessage(list),
      url: single ? links.task(hunt.slug, list[0].taskId) : links.hunt(hunt.slug),
      tag: single ? `unlock:${list[0].taskId}` : `unlock:${hunt.id}:${now.getTime()}`,
    });
  }
}

export async function announceHuntMoments(now = new Date()): Promise<void> {
  await state.ready;
  const clocks = await loadHuntClocks();
  const seen = new Set<string>();
  for (const hunt of clocks) {
    seen.add(hunt.id);
    const next = observeHunt(hunt, now);
    const moment = huntMoment(state.hunts.get(hunt.id), next);
    state.hunts.set(hunt.id, next);
    if (moment.changed) publish(hunt.id, { type: "hunt.changed" });
    if (moment.announce === "started") {
      push(hunt.id, {
        title: hunt.name,
        body: "The hunt has started — good luck!",
        url: links.hunt(hunt.slug),
        tag: `hunt:${hunt.id}:phase`,
      });
    } else if (moment.announce === "ended") {
      push(hunt.id, {
        title: hunt.name,
        body: "Time’s up. Final results are in.",
        url: links.scoreboard(hunt.slug),
        tag: `hunt:${hunt.id}:phase`,
      });
    }
  }
  // Unpublished or deleted hunts start fresh if they come back.
  for (const id of state.hunts.keys()) if (!seen.has(id)) state.hunts.delete(id);
}

registerJob("task-unlocks", 30_000, () => announceUnlockedTasks());
registerJob("hunt-start-end", 15_000, () => announceHuntMoments());
