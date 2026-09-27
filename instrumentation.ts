/**
 * Runs once per server boot, before any request is handled.
 * Brings the database schema up to date so there is no separate "seed" step.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runMigrations } = await import("./lib/db/migrate");
  await runMigrations();
  // Feature modules register their periodic jobs when imported.
  await import("./lib/judging/jobs");
  await import("./lib/live/jobs");
  const { startBackgroundJobs } = await import("./lib/jobs");
  startBackgroundJobs();
}
