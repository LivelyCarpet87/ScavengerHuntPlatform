import type { HuntEvent, HuntEventEnvelope } from "./bus";

export type EventViewer = {
  staff: boolean;
  teamId: string | null;
  /**
   * Whether other teams' score changes made at `at` are hidden from this
   * viewer (the scoreboard freeze): they can't change anything the viewer
   * sees, so they aren't sent.
   */
  frozen?: (at: number) => boolean;
};

/**
 * What a viewer may see of an event. Staff see everything; players see their
 * own team's submission events in full and everyone else's only as
 * "scores changed"; the public sees scoreboard-level events only.
 * Team-scoped score and team changes say whether they concern the viewer's
 * own team (`mine`) without naming another team, so pages can take other
 * teams' activity at a slower pace. Returns null to drop the event.
 */
export function eventForViewer(e: HuntEventEnvelope, viewer: EventViewer): HuntEventEnvelope | null {
  if (viewer.staff) return e;
  if (e.audience === "staff") return null;
  const base = { huntId: e.huntId, seq: e.seq, at: e.at };
  const mine = (teamId: string | undefined) => !!viewer.teamId && teamId === viewer.teamId;
  switch (e.type) {
    case "submission.created":
      if (mine(e.teamId)) return e;
      return null;
    case "submission.judged":
      if (mine(e.teamId)) return e;
      // Only an acceptance moves the board. Turning down a pending try (a wrong answer) changes
      // nothing; taking back an accepted one publishes its own scores.changed.
      if (e.status !== "approved" || viewer.frozen?.(e.at)) return null;
      return { ...base, type: "scores.changed", mine: false };
    case "scores.changed":
      // Hunt-wide (a task's scoring changed, a hunt reset): everyone's board moves.
      if (!e.teamId) return { ...base, type: e.type };
      if (!mine(e.teamId) && viewer.frozen?.(e.at)) return null;
      return { ...base, type: e.type, mine: mine(e.teamId) };
    case "hunt.changed":
      return { ...base, type: e.type };
    case "announcement.created":
      return e;
    case "tasks.changed":
      return viewer.teamId ? e : null;
    case "teams.changed":
      // Names and colors show on a frozen board too, so these always go through.
      return e.teamId ? { ...base, type: e.type, mine: mine(e.teamId) } : { ...base, type: e.type };
    default: {
      const never: never = e;
      return never;
    }
  }
}

export type { HuntEvent };
