/*
 * Archived hunts are read-only: organizer actions that would change their
 * course, teams, schedule or results refuse, on a throwaway SQLite file.
 * `@/lib/db` is swapped for that database and the signed-in staff member is
 * faked, so neither the dev database nor a browser is involved.
 */
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "@/lib/db/schema";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shp-archived-test-"));
const client = createClient({ url: `file:${path.join(dir, "test.db")}`, timeout: 5000 });
const db = drizzle(client, { schema });

class Redirect extends Error {
  constructor(public url: string) {
    super(`redirect ${url}`);
  }
}

mock.module("server-only", () => ({}));
mock.module("@/lib/db", () => ({ db, dbClient: client, dbReady: Promise.resolve(), schema }));
mock.module("next/cache", () => ({ revalidatePath: () => {}, refresh: () => {} }));
mock.module("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
  notFound: () => {
    throw new Error("not found");
  },
}));
// Uploads never run here; keep the real storage module (and sharp) out of it.
mock.module("@/lib/storage", () => ({
  deleteFiles: async () => {},
  deleteHuntStorage: async () => {},
  storeUpload: async () => {
    throw new Error("no uploads in tests");
  },
  UploadError: class UploadError extends Error {},
  variantPath: () => "",
}));
const user = { id: "u-owner", name: "Olive Owner", email: "olive@example.com", isAdmin: true, canCreateHunts: true };
mock.module("@/lib/auth/access", () => ({
  CANNOT_CREATE_HUNTS: "Your account can't create hunts.",
  canCreateHunts: (u: { isAdmin: boolean; canCreateHunts: boolean }) => u.isAdmin || u.canCreateHunts,
  requireUser: async () => user,
  requireStaff: async (huntId: string) => {
    const hunt = await db.select().from(schema.hunts).where(eq(schema.hunts.id, huntId)).get();
    if (!hunt) throw new Error("not found");
    return { user, hunt, role: "owner" as const };
  },
}));

const { ARCHIVED_READ_ONLY } = await import("./guards");
const tasksActions = await import("./task-actions");
const teamActions = await import("./team-actions");
const huntActions = await import("./hunt-actions");

const HUNT = "archivedHunt0001";
const TASK = "archivedTask0001";
const TEAM = "archivedTeam0001";
const HINT = "archivedHint0001";

beforeAll(async () => {
  await client.execute("PRAGMA journal_mode = WAL");
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await db.insert(schema.users).values({ id: user.id, name: user.name, email: user.email, passwordHash: "x" });
  await db
    .insert(schema.hunts)
    .values({ id: HUNT, slug: "archived-test", name: "Archived Test", joinCode: "654321", status: "archived" });
  await db.insert(schema.tasks).values({ id: TASK, huntId: HUNT, code: 31, title: "Red door", points: 100 });
  await db.insert(schema.hints).values({ id: HINT, huntId: HUNT, taskId: TASK, body: "Look up", cost: 10 });
  await db.insert(schema.teams).values({
    id: TEAM,
    huntId: HUNT,
    name: "Night Owls",
    nameKey: "night owls",
    emoji: "🦉",
    color: "plum",
    code: "ABC234",
  });
  await db.insert(schema.submissions).values({ huntId: HUNT, taskId: TASK, teamId: TEAM, status: "approved" });
});

afterAll(() => {
  client.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

const taskFields = {
  huntId: HUNT,
  taskId: TASK,
  kind: "media",
  code: "31",
  title: "Red door, renamed",
  description: "",
  answers: "",
  scoring: "fixed",
  points: "500",
};

const refused = { ok: false, error: ARCHIVED_READ_ONLY };

async function counts() {
  const n = async (
    table: typeof schema.tasks | typeof schema.teams | typeof schema.hints | typeof schema.submissions,
  ) => (await db.select().from(table)).length;
  return {
    tasks: await n(schema.tasks),
    teams: await n(schema.teams),
    hints: await n(schema.hints),
    submissions: await n(schema.submissions),
  };
}

describe("an archived hunt", () => {
  test("refuses task, hint and team changes, the schedule and a reset", async () => {
    const before = await counts();
    expect(await tasksActions.saveTaskAction(null, form(taskFields))).toEqual(refused);
    expect(await tasksActions.deleteTaskAction(null, form({ huntId: HUNT, taskId: TASK }))).toEqual(refused);
    expect(await tasksActions.duplicateTaskAction(null, form({ huntId: HUNT, taskId: TASK }))).toEqual(refused);
    expect(await tasksActions.moveTaskAction({ huntId: HUNT, taskId: TASK, direction: "down" })).toEqual(refused);
    expect(
      await tasksActions.addHintAction(null, form({ huntId: HUNT, taskId: TASK, body: "More", cost: "5" })),
    ).toEqual(refused);
    expect(await tasksActions.deleteHintAction(null, form({ huntId: HUNT, hintId: HINT }))).toEqual(refused);
    expect(await teamActions.addTeamsAction(null, form({ huntId: HUNT, names: "Latecomers" }))).toEqual(refused);
    expect(
      await teamActions.updateTeamAction(
        null,
        form({ huntId: HUNT, teamId: TEAM, name: "Night Owls", emoji: "🦉", color: "plum", hidden: "on" }),
      ),
    ).toEqual(refused);
    expect(await teamActions.deleteTeamAction(null, form({ huntId: HUNT, teamId: TEAM }))).toEqual(refused);
    expect(await huntActions.updateScheduleAction(null, form({ huntId: HUNT, startsAt: "", endsAt: "" }))).toEqual(
      refused,
    );
    expect(await huntActions.resetHuntAction(null, form({ huntId: HUNT, confirmName: "Archived Test" }))).toEqual(
      refused,
    );

    expect(await counts()).toEqual(before);
    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, TASK)).get();
    expect(task?.title).toBe("Red door");
    expect(task?.points).toBe(100);
    const team = await db.select().from(schema.teams).where(eq(schema.teams.id, TEAM)).get();
    expect(team?.hidden).toBe(false);
  });

  test("changes again once it's restored", async () => {
    await db.update(schema.hunts).set({ status: "published" }).where(eq(schema.hunts.id, HUNT));
    // Saving redirects back to the task list.
    await expect(tasksActions.saveTaskAction(null, form(taskFields))).rejects.toThrow(Redirect);
    const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, TASK)).get();
    expect(task?.title).toBe("Red door, renamed");
    expect(task?.points).toBe(500);
  });
});

describe("running a hunt again", () => {
  test("opens registration in the copy, like the schedule starts empty", async () => {
    await db.update(schema.hunts).set({ registrationOpen: false }).where(eq(schema.hunts.id, HUNT));
    let copyUrl = "";
    try {
      await huntActions.duplicateHuntAction(null, form({ huntId: HUNT }));
    } catch (err) {
      if (!(err instanceof Redirect)) throw err;
      copyUrl = err.url;
    }
    const copyId = /\/manage\/([^?]+)/.exec(copyUrl)?.[1] ?? "";
    const copy = await db.select().from(schema.hunts).where(eq(schema.hunts.id, copyId)).get();
    expect(copy?.status).toBe("draft");
    expect(copy?.registrationOpen).toBe(true);
    expect(copy?.startsAt).toBeNull();
  });
});
