import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db, dbReady } from "./index";

/** Applies pending SQL migrations from /drizzle. Safe to call on every boot. */
export async function runMigrations() {
  await dbReady;
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}
