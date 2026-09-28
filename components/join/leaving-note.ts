import type { LeavingOutcome } from "@/lib/player/queries";

/**
 * What happens to the team this device is leaving (moving to another team,
 * or picking a name on another team), in one sentence.
 */
export function leavingNote(team: string, outcome: LeavingOutcome): string {
  switch (outcome) {
    case "removed":
      return `Nobody else is on ${team} and it hasn’t sent anything yet, so it will be removed.`;
    case "empty":
      return `${team} keeps everything it has scored, but nobody will be left on it.`;
    default:
      return `${team} keeps everything it has scored.`;
  }
}
