/**
 * Lightweight in-process scheduler for periodic work (expiring judge claims,
 * announcing unlocked tasks, pruning sessions). Started from instrumentation.ts.
 *
 * Register a job at module scope in the file that owns the behaviour:
 *
 *   registerJob("release-stale-claims", 30_000, async () => { ... })
 *
 * and import that module from `startBackgroundJobs` below so it is loaded.
 */

type Job = { name: string; everyMs: number; run: () => Promise<void>; running: boolean };

type JobsGlobal = { __shpJobs?: { jobs: Map<string, Job>; timers: NodeJS.Timeout[] } };
const g = globalThis as JobsGlobal;
const state = g.__shpJobs ?? { jobs: new Map<string, Job>(), timers: [] };
g.__shpJobs = state;

export function registerJob(name: string, everyMs: number, run: () => Promise<void>) {
  state.jobs.set(name, { name, everyMs, run, running: false });
}

export function startBackgroundJobs() {
  for (const t of state.timers) clearInterval(t);
  state.timers = [];
  for (const job of state.jobs.values()) {
    const timer = setInterval(async () => {
      if (job.running) return;
      job.running = true;
      try {
        await job.run();
      } catch (err) {
        console.error(`[job:${job.name}]`, err);
      } finally {
        job.running = false;
      }
    }, job.everyMs);
    timer.unref?.();
    state.timers.push(timer);
  }
}
