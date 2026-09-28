import "server-only";
import { eq, isNull, lte, or, type SQL } from "drizzle-orm";
import { getPlayer, getStaffRole } from "@/lib/auth/access";
import { type Hunt, tasks, teams } from "@/lib/db/schema";
import { canViewScoreboard, type ScoreboardViewer } from "@/lib/hunts";

/**
 * Who is looking at a live view (JSON feeds, big screen): staff of the hunt,
 * a player on one of its teams, or the public. Memoized per request through
 * getStaffRole/getPlayer.
 */
export async function getLiveViewer(huntId: string): Promise<ScoreboardViewer> {
  const [staffRole, me] = await Promise.all([getStaffRole(huntId), getPlayer(huntId)]);
  return { isStaff: !!staffRole, isPlayer: !!me };
}

/**
 * The audience of a projector in the room: what any player sees. Staff who
 * open the big screen still get frozen standings, no hidden teams and the
 * gallery rules for players, so the room never sees more than the players.
 * Only ever used after canSeeBoard passed for the real viewer, and it never
 * grants more than that viewer has.
 */
export const ROOM: ScoreboardViewer = { isStaff: false, isPlayer: true };

/** Scoreboard access, including the draft rule (drafts are staff-only everywhere). */
export function canSeeBoard(hunt: Pick<Hunt, "status" | "scoreboardVisibility">, viewer: ScoreboardViewer): boolean {
  if (hunt.status === "draft" && !viewer.isStaff) return false;
  return canViewScoreboard(hunt, viewer);
}

/**
 * Query conditions (on submissions joined with teams and tasks) that keep
 * non-staff to what players may see: no hidden tasks, no task whose unlock
 * time is still ahead (its title stays a secret until then), and no hidden
 * teams — except the viewer's own team, when given.
 */
export function visibleToPlayers(now: Date, ownTeamId?: string | null): SQL[] {
  const unlocked = or(isNull(tasks.unlockAt), lte(tasks.unlockAt, now));
  const team = ownTeamId ? or(eq(teams.hidden, false), eq(teams.id, ownTeamId)) : eq(teams.hidden, false);
  return [eq(tasks.hidden, false), ...(unlocked ? [unlocked] : []), ...(team ? [team] : [])];
}
