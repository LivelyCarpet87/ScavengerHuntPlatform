/** Client-safe constants for judging. */

/** A judge's soft claim on a submission lapses after this long without being renewed. */
export const CLAIM_TTL_MS = 2 * 60_000;

/** How often the judging queue renews the claim on the submission that's open. */
export const CLAIM_HEARTBEAT_MS = 45_000;

/** Claims stop being renewed after this long without any input from the judge. */
export const CLAIM_IDLE_MS = 3 * 60_000;

/** How long the undo toast stays after a decision. */
export const UNDO_WINDOW_MS = 6_000;

/**
 * Result push notifications wait this long and re-check the decision first,
 * so a decision undone from the toast never buzzes the team's phones.
 */
export const PUSH_DELAY_MS = UNDO_WINDOW_MS + 2_500;

/** Waiting submissions the judging queue loads at a time (it offers more on request). */
export const QUEUE_PAGE_SIZE = 40;

/** The most the judging queue loads, however far a judge pages. */
export const QUEUE_MAX = 400;

/** Submissions per page in the submissions browser. */
export const SUBMISSIONS_PAGE_SIZE = 50;

/** Entries per page in the activity log. */
export const ACTIVITY_PAGE_SIZE = 50;

/**
 * fflate writes classic ZIP (no ZIP64), so one archive must stay under 4 GiB.
 * Above this, the export offers one ZIP per task instead.
 */
export const MAX_ZIP_BYTES = 3.5 * 1024 * 1024 * 1024;

/** Whether a claim by someone else is still live at `now`. */
export function isClaimLive(claim: { userId: string; at: number } | null, viewerId: string, now: number): boolean {
  return !!claim && claim.userId !== viewerId && now - claim.at < CLAIM_TTL_MS;
}
