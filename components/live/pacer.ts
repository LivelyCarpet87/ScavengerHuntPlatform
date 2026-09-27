/*
 * Paces reloads driven by live events.
 *
 * - "soon": something that concerns this viewer (their own team, the whole
 *   hunt). Waits for a quiet moment (`quietMs`), at most `maxWaitMs` after
 *   the first request, so a burst of events costs one reload.
 * - "later": another team's activity (a rank or a count may have moved).
 *   At most one run per `gapMs`, plus random jitter so the phones of a big
 *   event don't all reload at the same instant. A pending run is never
 *   postponed, so a steady stream of events still gets through.
 *
 * While the tab is hidden nothing runs: `hide()` holds back what's pending
 * and `show()` runs it when the tab is visible again — except what was asked
 * for with `{ hidden: true }` (e.g. a judge's tab title counting new
 * submissions in the background).
 */

export type Pace = "soon" | "later";

export type PacerOptions = { quietMs: number; maxWaitMs: number; gapMs: number; jitterMs: number };

export type Pacer = {
  ask(pace?: Pace, opts?: { hidden?: boolean }): void;
  /** The tab went into the background. */
  hide(): void;
  /** The tab is visible again; `force` runs even when nothing was held back. */
  show(force?: boolean): void;
  cancel(): void;
};

export function createPacer(run: () => void, opts: PacerOptions): Pacer {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstAskedAt: number | null = null;
  let lastRunAt = 0;
  let held = false;
  /** The pending run should happen even while the tab is hidden. */
  let background = false;

  const fire = () => {
    timer = undefined;
    firstAskedAt = null;
    held = false;
    background = false;
    lastRunAt = Date.now();
    run();
  };
  const arm = (at: number) => {
    clearTimeout(timer);
    timer = setTimeout(fire, Math.max(0, at - Date.now()));
  };

  const pacer: Pacer = {
    ask(pace = "soon", { hidden = false } = {}) {
      if (!hidden && typeof document !== "undefined" && document.visibilityState === "hidden") {
        held = true;
        return;
      }
      const now = Date.now();
      if (pace === "later") {
        if (timer) return;
        background = hidden;
        arm(Math.max(now + opts.quietMs, lastRunAt + opts.gapMs) + Math.random() * opts.jitterMs);
        return;
      }
      firstAskedAt ??= now;
      background ||= hidden;
      arm(Math.min(now + opts.quietMs, firstAskedAt + opts.maxWaitMs));
    },
    hide() {
      if (!timer || background) return;
      clearTimeout(timer);
      timer = undefined;
      firstAskedAt = null;
      held = true;
    },
    show(force = false) {
      if (!held && !force) return;
      held = false;
      pacer.ask("soon");
    },
    cancel() {
      clearTimeout(timer);
      timer = undefined;
      firstAskedAt = null;
      held = false;
      background = false;
    },
  };
  return pacer;
}
