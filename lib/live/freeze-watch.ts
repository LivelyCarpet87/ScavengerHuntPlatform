import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { type Hunt, hunts } from "@/lib/db/schema";
import { scoreboardCutoff } from "@/lib/hunts";
import { PUSH_DELAY_MS } from "@/lib/judging/constants";
import { ROOM } from "./viewer";

type Times = Pick<Hunt, "status" | "startsAt" | "endsAt" | "freezeAt">;

/**
 * Decisions made in the judging queue reach players once their undo window
 * has passed, so one made just before the freeze can land a few seconds
 * after it — and still counts on the frozen board.
 */
const RELEASE_GRACE_MS = PUSH_DELAY_MS + 5_000;

const reloads = new Map<string, Promise<Times | undefined>>();

/** One query per schedule change, however many streams of the hunt are open. */
function loadTimes(huntId: string): Promise<Times | undefined> {
  let pending = reloads.get(huntId);
  if (!pending) {
    pending = db
      .select({ status: hunts.status, startsAt: hunts.startsAt, endsAt: hunts.endsAt, freezeAt: hunts.freezeAt })
      .from(hunts)
      .where(eq(hunts.id, huntId))
      .get()
      .catch((err) => {
        console.error("[live] could not reload the hunt schedule", err);
        return undefined;
      })
      .finally(() => reloads.delete(huntId));
    reloads.set(huntId, pending);
  }
  return pending;
}

/**
 * The scoreboard freeze as the event stream applies it to players and the
 * public: `frozen(at)` tells whether another team's score change made at
 * `at` falls inside it (it can't move anything they see, so it isn't sent).
 * Call `reload()` on hunt.changed — the schedule may have moved.
 */
export function freezeWatch(hunt: Times & { id: string }): { frozen: (at: number) => boolean; reload: () => void } {
  let times: Times = hunt;
  return {
    frozen: (at) => {
      if (!times.freezeAt || at < times.freezeAt.getTime() + RELEASE_GRACE_MS) return false;
      return scoreboardCutoff(times, ROOM, new Date(at)) != null;
    },
    reload: () => {
      void loadTimes(hunt.id).then((next) => {
        if (next) times = next;
      });
    },
  };
}
