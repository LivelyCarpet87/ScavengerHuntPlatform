import { and, count, eq, gt, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { announcements, type Player, submissions } from "@/lib/db/schema";

/**
 * Unread items in a player's Updates tab: announcements and judged
 * submissions of their team since they last opened it.
 */
export async function countUnread(
  player: Pick<Player, "huntId" | "teamId" | "seenUpdatesAt" | "createdAt">,
): Promise<number> {
  const since = player.seenUpdatesAt ?? player.createdAt;
  const [a, s] = await Promise.all([
    db
      .select({ n: count() })
      .from(announcements)
      .where(and(eq(announcements.huntId, player.huntId), gt(announcements.createdAt, since)))
      .get(),
    db
      .select({ n: count() })
      .from(submissions)
      .where(
        and(
          eq(submissions.teamId, player.teamId),
          isNotNull(submissions.judgedAt),
          eq(submissions.autoJudged, false),
          gt(submissions.judgedAt, since),
        ),
      )
      .get(),
  ]);
  return (a?.n ?? 0) + (s?.n ?? 0);
}
