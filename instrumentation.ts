/**
 * Runs once per server boot, before any request is handled.
 * Brings the database schema up to date so there is no separate "seed" step.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runMigrations } = await import("./lib/db/migrate");
  await runMigrations();
  const { startBackgroundJobs } = await import("./lib/jobs");
  startBackgroundJobs();
}
