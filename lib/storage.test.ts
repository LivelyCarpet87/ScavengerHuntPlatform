/*
 * storeUpload on a throwaway database and upload folder: what lands on disk
 * as the "original" must not carry the uploader's location or device.
 */
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import sharp from "sharp";
import * as schema from "@/lib/db/schema";
import type { UploadKind } from "./storage";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shp-storage-test-"));
const client = createClient({ url: `file:${path.join(dir, "test.db")}`, timeout: 5000 });
const db = drizzle(client, { schema });

mock.module("@/lib/db", () => ({ db, dbClient: client, dbReady: Promise.resolve(), schema }));
mock.module("@/lib/env", () => ({
  env: { uploadsDir: path.join(dir, "uploads"), dataDir: dir, maxUploadBytes: 20 * 1024 * 1024 },
}));
const storage = await import("./storage");

const GPS = {
  IFD0: { Make: "LeakyPhoneMaker", Model: "LeakyModel 9" },
  IFD3: {
    GPSLatitudeRef: "N",
    GPSLatitude: "51/1 45/1 3456/100",
    GPSLongitudeRef: "W",
    GPSLongitude: "1/1 15/1 4320/100",
  },
};
const photo = () => sharp({ create: { width: 40, height: 20, channels: 3, background: "#2a6" } });
let huntId = "";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  const [hunt] = await db
    .insert(schema.hunts)
    .values({ slug: "storage-test", name: "Storage Test", joinCode: "654321" })
    .returning();
  huntId = hunt.id;
});

afterAll(() => {
  client.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const store = (bytes: Buffer, allow: UploadKind[] = ["image", "video"]) =>
  storage.storeUpload({
    file: new Blob([new Uint8Array(bytes)]),
    huntId,
    ownerKind: "submission",
    ownerId: "sub-1",
    allow,
  });

describe("storeUpload", () => {
  test("a phone JPEG is stored without GPS or device, still upright", async () => {
    const input = await photo().jpeg().withExif(GPS).withMetadata({ orientation: 6 }).toBuffer();
    const row = await store(input);
    const original = fs.readFileSync(storage.variantPath(row, "original"));
    expect(original.includes("LeakyPhoneMaker")).toBe(false);
    expect(row.variants).toEqual(["clean", "display", "thumb"]);
    expect(row.size).toBe(original.length);
    expect([row.width, row.height]).toEqual([20, 40]);
    expect((await sharp(original).metadata()).orientation).toBe(6);
    const saved = await db.select().from(schema.files).where(eq(schema.files.id, row.id)).get();
    expect(saved?.variants).toContain("clean");
  });

  test("a rotated PNG is re-encoded upright without its EXIF", async () => {
    const input = await photo().png().withExif(GPS).withMetadata({ orientation: 6 }).toBuffer();
    const row = await store(input);
    const original = fs.readFileSync(storage.variantPath(row, "original"));
    expect(original.includes("LeakyPhoneMaker")).toBe(false);
    expect(storage.isClean(row)).toBe(true);
    const meta = await sharp(original).metadata();
    expect([meta.width, meta.height, meta.orientation ?? 1]).toEqual([20, 40, 1]);
  });

  test("a video container it can't clean is kept but not marked clean", async () => {
    const avi = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([0x40, 0, 0, 0]),
      Buffer.from("AVI LIST"),
      Buffer.alloc(56),
    ]);
    const row = await store(avi);
    expect(row.kind).toBe("video");
    expect(storage.isClean(row)).toBe(false);
  });

  test("files stored before cleaning existed are cleaned once", async () => {
    const input = await photo().jpeg().withExif(GPS).toBuffer();
    const row = await store(input);
    // Pretend it was stored raw by an earlier version.
    fs.writeFileSync(storage.variantPath(row, "original"), input);
    await db
      .update(schema.files)
      .set({ variants: ["display", "thumb"] })
      .where(eq(schema.files.id, row.id));
    expect(await storage.cleanStoredUploads()).toBe(1);
    const saved = await db.select().from(schema.files).where(eq(schema.files.id, row.id)).get();
    expect(saved?.variants).toEqual(["clean", "display", "thumb"]);
    const original = fs.readFileSync(storage.variantPath(row, "original"));
    expect(original.includes("LeakyPhoneMaker")).toBe(false);
    expect(saved?.size).toBe(original.length);
    expect(await storage.cleanStoredUploads()).toBe(0);
  });
});
