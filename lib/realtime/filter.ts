import type { HuntEvent, HuntEventEnvelope } from "./bus";

export type EventViewer = { staff: boolean; teamId: string | null };

/**
 * What a viewer may see of an event. Staff see everything; players see their
 * own team's submission events in full and everyone else's only as
 * "scores changed"; the public sees scoreboard-level events only.
 * Returns null to drop the event.
 */
export function eventForViewer(e: HuntEventEnvelope, viewer: EventViewer): HuntEventEnvelope | null {
  if (viewer.staff) return e;
  if (e.audience === "staff") return null;
  const base = { huntId: e.huntId, seq: e.seq, at: e.at };
  const scoresChanged = (): HuntEventEnvelope => ({ ...base, type: "scores.changed" });
  switch (e.type) {
    case "submission.created":
      if (viewer.teamId && e.teamId === viewer.teamId) return e;
      return null;
    case "submission.judged":
      if (viewer.teamId && e.teamId === viewer.teamId) return e;
      return scoresChanged();
    case "scores.changed":
    case "hunt.changed":
      return { ...base, type: e.type } as HuntEventEnvelope;
    case "announcement.created":
      return e;
    case "tasks.changed":
      return viewer.teamId ? e : null;
    case "teams.changed":
      return { ...base, type: "teams.changed" };
    default: {
      const never: never = e;
      return never;
    }
  }
}

export type { HuntEvent };
