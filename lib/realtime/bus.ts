import type { SubmissionStatus } from "@/lib/db/schema";

/**
 * In-process pub/sub for hunt events. Mutations call `publish(huntId, event)`;
 * the SSE endpoint (/api/hunts/[huntId]/events) fans events out to connected
 * browsers, and the standings cache invalidates itself on every event.
 *
 * Events carry ids plus a few display fields (team/task names) so toasts can
 * render without a round trip. The SSE endpoint strips team-private details
 * before forwarding to other teams or the public.
 *
 * Single-process by design (SQLite is single-node too). Running several app
 * instances would need a shared broker (e.g. Redis pub/sub) behind this API.
 */

/** Display fields a publisher may attach; all optional. */
type Display = {
  teamName?: string;
  taskTitle?: string;
  taskCode?: number;
  taskKind?: "media" | "answer" | "checkpoint" | "contest";
};

export type HuntEvent =
  | ({ type: "submission.created"; submissionId: string; teamId: string; taskId: string } & Display)
  | ({
      type: "submission.judged";
      submissionId: string;
      teamId: string;
      taskId: string;
      status: SubmissionStatus;
      /** Points the team now holds for this task (after the decision), if known. */
      points?: number | null;
      feedback?: string | null;
    } & Display)
  | { type: "scores.changed"; teamId?: string }
  | { type: "announcement.created"; announcementId: string; title?: string | null; body?: string }
  | { type: "tasks.changed" }
  | { type: "teams.changed"; teamId?: string }
  | { type: "hunt.changed" };

export type HuntEventType = HuntEvent["type"];

export type HuntEventEnvelope = HuntEvent & {
  huntId: string;
  seq: number;
  at: number;
  /** "staff": delivered to hunt staff only (e.g. a decision still inside its undo window). */
  audience?: "staff";
};

type Listener = (event: HuntEventEnvelope) => void;

type BusGlobal = {
  __shpBus?: { listeners: Map<string, Set<Listener>>; versions: Map<string, number>; seq: number };
};
const g = globalThis as BusGlobal;
const bus = g.__shpBus ?? { listeners: new Map<string, Set<Listener>>(), versions: new Map<string, number>(), seq: 0 };
g.__shpBus = bus;

export function subscribe(huntId: string, listener: Listener): () => void {
  let set = bus.listeners.get(huntId);
  if (!set) {
    set = new Set();
    bus.listeners.set(huntId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) bus.listeners.delete(huntId);
  };
}

/**
 * Broadcast an event to everyone watching the hunt (or only its staff) and
 * invalidate cached standings.
 */
export function publish(huntId: string, event: HuntEvent, opts: { audience?: "staff" } = {}): void {
  bus.versions.set(huntId, (bus.versions.get(huntId) ?? 0) + 1);
  bus.seq += 1;
  const envelope: HuntEventEnvelope = { ...event, huntId, seq: bus.seq, at: Date.now() };
  if (opts.audience) envelope.audience = opts.audience;
  const set = bus.listeners.get(huntId);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(envelope);
    } catch (err) {
      console.error("[bus] listener failed", err);
    }
  }
}

/** Monotonic per-hunt counter; changes whenever anything in the hunt changes. */
export function huntVersion(huntId: string): number {
  return bus.versions.get(huntId) ?? 0;
}

export function listenerCount(huntId: string): number {
  return bus.listeners.get(huntId)?.size ?? 0;
}
