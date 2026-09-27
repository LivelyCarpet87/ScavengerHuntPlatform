import fs from "node:fs";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { canViewFile } from "@/lib/files-access";
import { type Variant, variantPath } from "@/lib/storage";

const VARIANTS: Variant[] = ["original", "display", "thumb", "poster"];

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

/**
 * Serves uploaded files after an access check. Supports HTTP Range requests
 * so videos can seek (and play at all on iOS Safari).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; variant: string }> }) {
  const { id, variant } = await ctx.params;
  if (!VARIANTS.includes(variant as Variant)) return notFound();
  const file = await db.select().from(files).where(eq(files.id, id)).get();
  if (!file || !(await canViewFile(file))) return notFound();

  const v: Variant = variant === "original" || file.variants.includes(variant) ? (variant as Variant) : "original";
  const p = variantPath(file, v);
  let size: number;
  try {
    size = fs.statSync(p).size;
  } catch {
    return notFound();
  }

  const etag = `"${file.id}-${v}"`;
  const headers = new Headers({
    "Content-Type": v === "original" ? file.mime : "image/webp",
    "Accept-Ranges": "bytes",
    // Content never changes for an id; privacy comes from the access check.
    "Cache-Control": "private, max-age=31536000, immutable",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  });
  if (req.nextUrl.searchParams.has("download")) {
    const name = (file.originalName || `${file.id}.${file.ext}`).replace(/["\\\r\n]/g, "");
    headers.set("Content-Disposition", `attachment; filename="${name}"`);
  }
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });

  const range = req.headers.get("range");
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (match) {
    let start = match[1] ? Number(match[1]) : NaN;
    let end = match[2] ? Number(match[2]) : NaN;
    if (Number.isNaN(start)) {
      // bytes=-N means the last N bytes.
      start = Math.max(0, size - end);
      end = size - 1;
    } else if (Number.isNaN(end) || end >= size) {
      end = size - 1;
    }
    if (start > end || start >= size) {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    const stream = Readable.toWeb(fs.createReadStream(p, { start, end })) as unknown as ReadableStream;
    return new Response(stream, { status: 206, headers });
  }

  headers.set("Content-Length", String(size));
  const stream = Readable.toWeb(fs.createReadStream(p)) as unknown as ReadableStream;
  return new Response(stream, { status: 200, headers });
}
