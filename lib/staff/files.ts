import "server-only";
import fsp from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { type FileRow, files } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { variantPath } from "@/lib/storage";

/** Stored files owned by any of the given owners in a hunt (rows only). */
export async function ownedFiles(huntId: string, ownerKind: FileRow["ownerKind"], ownerIds: string[]) {
  if (ownerIds.length === 0) return [];
  const out: FileRow[] = [];
  // Stay well under SQLite's bound-parameter limit for big hunts.
  for (let i = 0; i < ownerIds.length; i += 500) {
    const chunk = ownerIds.slice(i, i + 500);
    out.push(
      ...(await db
        .select()
        .from(files)
        .where(and(eq(files.huntId, huntId), eq(files.ownerKind, ownerKind), inArray(files.ownerId, chunk)))),
    );
  }
  return out;
}

/**
 * Copies stored files (bytes and rows) to a new owner, e.g. when a task or a
 * whole hunt is duplicated. Files whose bytes are missing on disk are skipped.
 */
export async function copyFiles(
  rows: FileRow[],
  target: { huntId: string; ownerKind: FileRow["ownerKind"]; ownerId: string },
): Promise<FileRow[]> {
  const copies: FileRow[] = [];
  for (const row of rows) {
    const copy: FileRow = {
      ...row,
      id: newId(),
      huntId: target.huntId,
      ownerKind: target.ownerKind,
      ownerId: target.ownerId,
      variants: [...row.variants],
      createdAt: new Date(),
    };
    const from = path.dirname(variantPath(row, "original"));
    const to = path.dirname(variantPath(copy, "original"));
    try {
      await fsp.cp(from, to, { recursive: true });
    } catch (err) {
      console.warn(`[staff] could not copy file ${row.id}:`, err);
      continue;
    }
    await db.insert(files).values(copy);
    copies.push(copy);
  }
  return copies;
}
