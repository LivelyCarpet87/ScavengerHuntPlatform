import "server-only";
import { eq } from "drizzle-orm";
import { getPlayer, getStaffRole } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { type FileRow, submissions, tasks } from "@/lib/db/schema";
import { canViewGallery, getHuntById, huntPhase, isTaskVisible, scoreboardCutoff } from "@/lib/hunts";
import { isClean, type Variant } from "@/lib/storage";

/**
 * Who may fetch an uploaded file (`variant` is the one actually served):
 *  - hunt staff: everything in their hunt
 *  - hunt cover: anyone once the hunt is published
 *  - task attachments: players of the hunt once the task is visible
 *  - submission media: the submitting team; others only for accepted
 *    submissions when the gallery is open to them (see canViewGallery), and
 *    the original only once its EXIF/GPS and container tags are gone
 */
export async function canViewFile(file: FileRow, variant: Variant): Promise<boolean> {
  if (!file.huntId) return false;
  const hunt = await getHuntById(file.huntId);
  if (!hunt) return false;
  if (await getStaffRole(hunt.id)) return true;
  if (hunt.status === "draft") return false;

  switch (file.ownerKind) {
    case "hunt":
      return true;
    case "task": {
      const me = await getPlayer(hunt.id);
      if (!me || huntPhase(hunt) === "upcoming") return false;
      const task = await db
        .select({ hidden: tasks.hidden, unlockAt: tasks.unlockAt })
        .from(tasks)
        .where(eq(tasks.id, file.ownerId))
        .get();
      return !!task && isTaskVisible(task);
    }
    case "submission": {
      const sub = await db
        .select({
          teamId: submissions.teamId,
          status: submissions.status,
          createdAt: submissions.createdAt,
          judgedAt: submissions.judgedAt,
        })
        .from(submissions)
        .where(eq(submissions.id, file.ownerId))
        .get();
      if (!sub) return false;
      const me = await getPlayer(hunt.id);
      if (me && me.team.id === sub.teamId) return true;
      const viewer = { isStaff: false, isPlayer: !!me };
      if (sub.status !== "approved" || !canViewGallery(hunt, viewer)) return false;
      if (variant === "original" && !isClean(file)) return false;
      // While the scoreboard is frozen, a newly accepted photo would give away a score.
      const cutoff = scoreboardCutoff(hunt, viewer);
      return !cutoff || (sub.createdAt <= cutoff && (!sub.judgedAt || sub.judgedAt <= cutoff));
    }
  }
}
