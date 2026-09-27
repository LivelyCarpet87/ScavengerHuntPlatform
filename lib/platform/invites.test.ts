/*
 * Database-backed checks for the account and invite rules, on a throwaway
 * SQLite file. `@/lib/db` is swapped for that database, so neither the dev
 * database nor a CI checkout's data folder is ever opened.
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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shp-platform-test-"));
const client = createClient({ url: `file:${path.join(dir, "test.db")}`, timeout: 5000 });
const db = drizzle(client, { schema });

// These modules are server-only; outside Next's server bundle the marker package throws.
mock.module("server-only", () => ({}));
mock.module("@/lib/db", () => ({ db, dbClient: client, dbReady: Promise.resolve(), schema }));
const users = await import("@/lib/auth/users");
const invites = await import("./invites");
const settings = await import("./settings");

const HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA";
let huntId = "";

beforeAll(async () => {
  await client.execute("PRAGMA journal_mode = WAL");
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  const [hunt] = await db
    .insert(schema.hunts)
    .values({ slug: "test-hunt", name: "Test Hunt", joinCode: "123456" })
    .returning();
  huntId = hunt.id;
});

afterAll(() => {
  client.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function invite(values: Partial<typeof schema.invites.$inferInsert> = {}) {
  const [row] = await db
    .insert(schema.invites)
    .values({ id: `tok${Math.random().toString(36).slice(2)}xyz`, role: "judge", ...values })
    .returning();
  return row;
}

// Note: these run one after another on purpose. With the local libSQL client every
// statement is synchronous, so two write transactions started in the same tick (e.g.
// Promise.all) make the second BEGIN IMMEDIATE wait out the busy timeout and fail with
// SQLITE_BUSY. Separate requests don't interleave that way.

describe("first-run setup", () => {
  test("creates the first account as admin, then never again", async () => {
    const first = await users.createFirstAdmin({ name: "Ada", email: "Ada@Example.com", passwordHash: HASH }, db);
    expect(first?.isAdmin).toBe(true);
    expect(first?.email).toBe("ada@example.com");
    expect(await users.createFirstAdmin({ name: "Bo", email: "bo@example.com", passwordHash: HASH }, db)).toBeNull();
    expect(await users.countAdmins(db)).toBe(1);
  });
});

describe("sign-up mode", () => {
  test("defaults to invite-only and can be opened and closed", async () => {
    expect(await settings.getSignupMode()).toBe("invite");
    await settings.setSignupMode("open");
    expect(await settings.getSignupMode()).toBe("open");
    await settings.setSignupMode("invite");
    expect(await settings.getSignupMode()).toBe("invite");
  });
});

describe("accounts", () => {
  test("emails are stored lowercased and unique regardless of case", async () => {
    const user = await users.insertUser({ name: "  Dee  ", email: " Dee@Example.COM ", passwordHash: HASH }, db);
    expect(user.email).toBe("dee@example.com");
    expect(user.name).toBe("Dee");
    expect(user.isAdmin).toBe(false);
    await expect(users.insertUser({ name: "Dee 2", email: "DEE@example.com", passwordHash: HASH }, db)).rejects.toThrow(
      users.EmailTakenError,
    );
  });
});

describe("invite use limits", () => {
  test("a single-use invite works once", async () => {
    const inv = await invite({ maxUses: 1 });
    expect(await invites.consumeInvite(db, inv.id)).toBe(true);
    expect(await invites.consumeInvite(db, inv.id)).toBe(false);
    const row = await db.select().from(schema.invites).where(eq(schema.invites.id, inv.id)).get();
    expect(row?.uses).toBe(1);
  });

  test("uses never exceed the limit", async () => {
    const inv = await invite({ maxUses: 2 });
    const results: boolean[] = [];
    for (let i = 0; i < 5; i++) results.push(await db.transaction((tx) => invites.consumeInvite(tx, inv.id)));
    expect(results).toEqual([true, true, false, false, false]);
  });

  test("revoked and expired invites can't be used", async () => {
    const revoked = await invite({ revokedAt: new Date() });
    const expired = await invite({ expiresAt: new Date(Date.now() - 1000) });
    const open = await invite({ expiresAt: new Date(Date.now() + 60_000) });
    expect(await invites.consumeInvite(db, revoked.id)).toBe(false);
    expect(await invites.consumeInvite(db, expired.id)).toBe(false);
    expect(await invites.consumeInvite(db, open.id)).toBe(true);
  });
});

describe("accepting hunt invites", () => {
  test("grants the role, then only ever upgrades", async () => {
    const sam = await users.insertUser({ name: "Sam", email: "sam@example.com", passwordHash: HASH }, db);
    const judgeInvite = await invite({ huntId, role: "judge" });
    const organizerInvite = await invite({ huntId, role: "organizer" });

    const first = await db.transaction((tx) => invites.acceptHuntInviteTx(tx, judgeInvite, sam.id));
    expect(first).toEqual({ outcome: "accepted", role: "judge", previous: null });
    expect(await invites.getMembershipRole(db, huntId, sam.id)).toBe("judge");

    // Same role again: nothing changes and the invite isn't used up.
    const again = await db.transaction((tx) => invites.acceptHuntInviteTx(tx, judgeInvite, sam.id));
    expect(again).toEqual({ outcome: "already", role: "judge" });
    const judgeRow = await db.select().from(schema.invites).where(eq(schema.invites.id, judgeInvite.id)).get();
    expect(judgeRow?.uses).toBe(1);

    const upgrade = await db.transaction((tx) => invites.acceptHuntInviteTx(tx, organizerInvite, sam.id));
    expect(upgrade).toEqual({ outcome: "accepted", role: "organizer", previous: "judge" });

    // A judge invite never downgrades an organizer.
    const lower = await invite({ huntId, role: "judge" });
    expect(await db.transaction((tx) => invites.acceptHuntInviteTx(tx, lower, sam.id))).toEqual({
      outcome: "already",
      role: "organizer",
    });
    expect(await invites.getMembershipRole(db, huntId, sam.id)).toBe("organizer");
  });

  test("a used-up invite grants nothing", async () => {
    const kim = await users.insertUser({ name: "Kim", email: "kim@example.com", passwordHash: HASH }, db);
    const inv = await invite({ huntId, role: "judge", maxUses: 1, uses: 1 });
    expect(await db.transaction((tx) => invites.acceptHuntInviteTx(tx, inv, kim.id))).toEqual({
      outcome: "unavailable",
    });
    expect(await invites.getMembershipRole(db, huntId, kim.id)).toBeNull();
  });
});
