import "server-only";
import type { Hunt } from "@/lib/db/schema";
import { huntPhase, type ScoreboardViewer, scoreboardCutoff } from "@/lib/hunts";
import { getStandings, type Standings } from "@/lib/scoring/service";
import { toRows } from "./shape";
import type { StandingsPayload } from "./types";

type HuntTimes = Pick<Hunt, "id" | "status" | "startsAt" | "endsAt" | "freezeAt">;

/**
 * Standings as a viewer may see them — computed at the viewer's freeze
 * cutoff (staff see live scores). Access must be checked by the caller.
 */
export async function loadStandings(
  hunt: HuntTimes,
  viewer: ScoreboardViewer,
  now = new Date(),
): Promise<{ payload: StandingsPayload; standings: Standings; cutoff: Date | null }> {
  const cutoff = scoreboardCutoff(hunt, viewer, now);
  const standings = await getStandings(hunt.id, { cutoff });
  const payload: StandingsPayload = {
    phase: huntPhase(hunt, now),
    frozenAt: cutoff ? cutoff.toISOString() : null,
    startsAt: hunt.startsAt ? hunt.startsAt.toISOString() : null,
    endsAt: hunt.endsAt ? hunt.endsAt.toISOString() : null,
    updatedAt: new Date(standings.computedAt).toISOString(),
    standings: toRows(standings, viewer),
  };
  return { payload, standings, cutoff };
}
