import { type ActionState, fail } from "@/lib/actions";
import type { Hunt } from "@/lib/db/schema";

/*
 * Archived hunts are read-only: their course (tasks, hints, attachments),
 * teams and schedule are filed away with the results. Organizer actions that
 * would change them refuse with this message until the hunt is restored in
 * Settings. Presentation settings (name, cover, visibility), staff, status,
 * "Run it again" and deleting the hunt stay available.
 *
 * Pure (no "use server"), so actions, pages and tests can share it.
 */

export const ARCHIVED_READ_ONLY = "This hunt is archived, so it’s read-only. Restore it in Settings to make changes.";

export function isArchived(hunt: Pick<Hunt, "status">): boolean {
  return hunt.status === "archived";
}

/** The failed result for a change to an archived hunt, or null when the hunt can be changed. */
export function archivedError(hunt: Pick<Hunt, "status">): ActionState<never> | null {
  return isArchived(hunt) ? fail(ARCHIVED_READ_ONLY) : null;
}
