import fs from "node:fs";
import { type Client, createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { env } from "../env";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

type DbGlobal = { __shpDb?: { client: Client; db: Db; ready: Promise<void> } };
const g = globalThis as DbGlobal;

function connect() {
  const isFile = env.databaseUrl.startsWith("file:");
  if (isFile) fs.mkdirSync(env.dataDir, { recursive: true });
  // The local client keeps a pool of connections; `timeout` is applied to each
  // one as SQLite's busy_timeout. libSQL enables foreign keys per connection.
  const client = createClient({
    url: env.databaseUrl,
    authToken: env.databaseAuthToken,
    timeout: 5000,
  });
  const db = drizzle(client, { schema });
  // WAL is persisted in the database file, so setting it once is enough. It lets
  // readers (scoreboards, live feeds) proceed while a judge is writing.
  const ready = isFile ? client.execute("PRAGMA journal_mode = WAL").then(() => undefined) : Promise.resolve();
  return { client, db, ready };
}

// Reuse one client across hot reloads in development.
const conn = g.__shpDb ?? connect();
g.__shpDb = conn;

export const db: Db = conn.db;
export const dbClient: Client = conn.client;
export const dbReady: Promise<void> = conn.ready;
export { schema };
