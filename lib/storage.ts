import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, notLike } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import sharp, { type Sharp } from "sharp";
import { db } from "@/lib/db";
import { type FileRow, files } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";
import { canStripMetadata, stripMetadata } from "@/lib/strip-metadata";

/*
 * Uploaded files live on disk under DATA_DIR/uploads/<huntId>/<fileId>/:
 *   original.<ext>   what was uploaded (validated by magic bytes); photos and
 *                    videos without their EXIF/GPS, XMP and container tags
 *   display.webp     images: ≤1600px, EXIF-rotated — what the UI shows
 *   thumb.webp       images: ≤480px — lists, queues, galleries
 *   poster.webp      videos: a frame captured on the device before upload
 * Derivatives are made once at upload time, never per request.
 * Files are served by app/files/[id]/[variant]/route.ts, which checks access.
 */

export type UploadKind = FileRow["kind"];
export type Variant = "original" | "display" | "thumb" | "poster";

/**
 * Marker in files.variants: the original no longer carries metadata that could
 * reveal where, when or with what device it was made. Only clean originals of
 * submissions are shared beyond staff and the team (see lib/files-access.ts).
 */
export const CLEAN = "clean";

export function isClean(file: Pick<FileRow, "variants">): boolean {
  return file.variants.includes(CLEAN);
}

/** Output formats for photos that can only be cleaned by re-encoding (e.g. a PNG whose EXIF says "rotate"). */
const REENCODE: Record<string, (img: Sharp) => Sharp> = {
  "image/jpeg": (img) => img.jpeg({ quality: 92, mozjpeg: true }),
  "image/png": (img) => img.png(),
  "image/webp": (img) => img.webp({ quality: 92 }),
  "image/gif": (img) => img.gif(),
  "image/tiff": (img) => img.tiff(),
  "image/avif": (img) => img.avif(),
};

/**
 * Photo or video bytes without identifying metadata, or null when the format
 * can't be cleaned. Lossless where the format allows (lib/strip-metadata.ts);
 * otherwise photos sharp can decode are re-encoded, which drops all metadata
 * except the color profile.
 */
async function withoutMetadata(buffer: Buffer, mime: string): Promise<Buffer | null> {
  const stripped = stripMetadata(buffer, mime);
  if (stripped) return stripped;
  const encode = REENCODE[mime];
  if (!encode) return null;
  try {
    const { pages = 1 } = await sharp(buffer, { failOn: "none" }).metadata();
    const img = sharp(buffer, { failOn: "none", animated: pages > 1 }).keepIccProfile();
    return await encode(pages > 1 ? img : img.autoOrient()).toBuffer();
  } catch {
    return null;
  }
}

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

function kindOf(mime: string): UploadKind | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "document";
  return null;
}

function fileDir(file: Pick<FileRow, "id" | "huntId">): string {
  return path.join(/*turbopackIgnore: true*/ env.uploadsDir, file.huntId ?? "_platform", file.id);
}

export function variantPath(file: Pick<FileRow, "id" | "huntId" | "ext">, variant: Variant): string {
  const name = variant === "original" ? `original.${file.ext}` : `${variant}.webp`;
  return path.join(/*turbopackIgnore: true*/ fileDir(file), name);
}

/** URL for a file variant; falls back to the original when the variant wasn't generated. */
export function fileUrl(file: Pick<FileRow, "id" | "variants">, variant: Variant = "display"): string {
  const v = variant === "original" || file.variants.includes(variant) ? variant : "original";
  return `/files/${file.id}/${v}`;
}

export type StoreUploadInput = {
  file: Blob;
  /** The name the device gave the file, kept for downloads. */
  name?: string | null;
  huntId: string | null;
  ownerKind: FileRow["ownerKind"];
  ownerId: string;
  allow: UploadKind[];
  maxBytes?: number;
  sortOrder?: number;
};

/** Validates, stores and records an upload. Throws UploadError with a user-facing message. */
export async function storeUpload(input: StoreUploadInput): Promise<FileRow> {
  const maxBytes = input.maxBytes ?? env.maxUploadBytes;
  if (input.file.size === 0) throw new UploadError("That file is empty.");
  if (input.file.size > maxBytes) {
    throw new UploadError(`That file is too large. The limit is ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const detected = await fileTypeFromBuffer(buffer);
  const kind = detected ? kindOf(detected.mime) : null;
  if (!detected || !kind || !input.allow.includes(kind)) {
    const wanted = input.allow.map((k) => (k === "image" ? "photo" : k)).join(" or ");
    throw new UploadError(`That file type isn't supported here. Upload a ${wanted}.`);
  }

  // Phones stamp photos and videos with GPS position, capture time and device;
  // none of it is kept (location is opt-in, per submission, for judges only).
  const clean = kind === "image" || kind === "video" ? await withoutMetadata(buffer, detected.mime) : null;
  const data = clean ?? buffer;

  const id = newId();
  const row: FileRow = {
    id,
    huntId: input.huntId,
    ownerKind: input.ownerKind,
    ownerId: input.ownerId,
    kind,
    mime: detected.mime,
    ext: detected.ext,
    size: data.length,
    width: null,
    height: null,
    originalName: input.name?.slice(0, 200) ?? null,
    variants: clean ? [CLEAN] : [],
    sortOrder: input.sortOrder ?? 0,
    createdAt: new Date(),
  };

  await fsp.mkdir(fileDir(row), { recursive: true });
  await fsp.writeFile(variantPath(row, "original"), data);

  if (kind === "image") {
    try {
      const base = sharp(data, { failOn: "none" }).autoOrient();
      const display = await base
        .clone()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(variantPath(row, "display"));
      await base
        .clone()
        .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 70 })
        .toFile(variantPath(row, "thumb"));
      const meta = await sharp(data, { failOn: "none" }).metadata();
      const rotated = (meta.orientation ?? 1) >= 5;
      row.width = (rotated ? meta.height : meta.width) ?? display.width;
      row.height = (rotated ? meta.width : meta.height) ?? display.height;
      row.variants.push("display", "thumb");
    } catch (err) {
      // Formats sharp can't decode (e.g. HEVC-coded HEIC) are kept as-is.
      console.warn(`[storage] could not derive variants for ${id}:`, err);
    }
  }

  await db.insert(files).values(row);
  return row;
}

/** Stores a video poster frame (a JPEG/PNG/WebP captured on the device). */
export async function storePoster(file: FileRow, poster: Blob): Promise<FileRow> {
  if (file.kind !== "video" || poster.size === 0 || poster.size > 5 * 1024 * 1024) return file;
  const buffer = Buffer.from(await poster.arrayBuffer());
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected?.mime.startsWith("image/")) return file;
  const info = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({ width: 960, height: 960, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 75 })
    .toFile(variantPath(file, "poster"));
  const variants = [...new Set([...file.variants, "poster", "thumb"])];
  // The poster doubles as the thumbnail in lists.
  await fsp.copyFile(variantPath(file, "poster"), variantPath(file, "thumb"));
  await db
    .update(files)
    .set({ variants, width: file.width ?? info.width, height: file.height ?? info.height })
    .where(eq(files.id, file.id));
  return { ...file, variants };
}

/** Files attached to the given owners, grouped by owner id and ordered. */
export async function filesFor(
  ownerKind: FileRow["ownerKind"],
  ownerIds: string[],
): Promise<Record<string, FileRow[]>> {
  if (ownerIds.length === 0) return {};
  const rows = await db
    .select()
    .from(files)
    .where(and(eq(files.ownerKind, ownerKind), inArray(files.ownerId, ownerIds)))
    .orderBy(files.sortOrder, files.createdAt);
  const out: Record<string, FileRow[]> = {};
  for (const row of rows) {
    const list = out[row.ownerId] ?? [];
    list.push(row);
    out[row.ownerId] = list;
  }
  return out;
}

/** Deletes file rows and their bytes. */
export async function deleteFiles(rows: Pick<FileRow, "id" | "huntId">[]): Promise<void> {
  if (rows.length === 0) return;
  await db.delete(files).where(
    inArray(
      files.id,
      rows.map((r) => r.id),
    ),
  );
  await Promise.all(rows.map((r) => fsp.rm(fileDir(r), { recursive: true, force: true })));
}

/** Removes every stored byte for a hunt (rows are removed by the hunt's cascade). */
export async function deleteHuntStorage(huntId: string): Promise<void> {
  await fsp.rm(path.join(/*turbopackIgnore: true*/ env.uploadsDir, huntId), { recursive: true, force: true });
}

/**
 * Cleans photos and videos stored before uploads were cleaned on arrival
 * (see storeUpload). Runs in the background at boot; a no-op once every file
 * is clean. Files it can't clean stay limited to staff and their own team.
 */
export async function cleanStoredUploads(): Promise<number> {
  const rows = await db
    .select()
    .from(files)
    .where(and(inArray(files.kind, ["image", "video"]), notLike(files.variants, `%"${CLEAN}"%`)));
  let cleaned = 0;
  for (const row of rows) {
    if (!canStripMetadata(row.mime) && !REENCODE[row.mime]) continue;
    const original = variantPath(row, "original");
    try {
      const clean = await withoutMetadata(await fsp.readFile(original), row.mime);
      if (!clean) continue;
      // Replace atomically: a download in progress keeps reading the old file.
      await fsp.writeFile(`${original}.tmp`, clean);
      await fsp.rename(`${original}.tmp`, original);
      await db
        .update(files)
        .set({ size: clean.length, variants: [CLEAN, ...row.variants] })
        .where(eq(files.id, row.id));
      cleaned++;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`[storage] could not clean ${row.id}:`, err);
    }
  }
  return cleaned;
}

export function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}
