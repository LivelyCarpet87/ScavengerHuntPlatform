/*
 * Results this device is already showing in place — the task page's answer
 * and punch feedback, the checkpoint poster page — keyed by task. PlayerLive
 * asks resultShownInline() before toasting a decision, so the player who
 * pressed the button doesn't get the same news twice; teammates' phones
 * still get their toast. Entries expire on their own.
 */

const shownInline = new Map<string, number>();

/** This device is about to show the result for `taskId` itself (for the next `ms`). */
export function expectInlineResult(taskId: string, ms = 15_000): void {
  const now = Date.now();
  for (const [id, until] of shownInline) if (until < now) shownInline.delete(id);
  shownInline.set(taskId, now + ms);
}

/** Whether a decision on `taskId` is already being shown in the page. */
export function resultShownInline(taskId: string): boolean {
  const until = shownInline.get(taskId);
  if (until == null) return false;
  if (until < Date.now()) {
    shownInline.delete(taskId);
    return false;
  }
  return true;
}
