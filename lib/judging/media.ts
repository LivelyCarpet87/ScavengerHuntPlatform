import "server-only";
import type { FileRow } from "@/lib/db/schema";
import { fileUrl } from "@/lib/storage";
import type { MediaFile } from "./types";

/** File row -> URLs the judging screens render (all served through the access-checked /files route). */
export function toMediaFile(file: FileRow): MediaFile {
  return {
    id: file.id,
    kind: file.kind,
    mime: file.mime,
    width: file.width,
    height: file.height,
    size: file.size,
    name: file.originalName,
    thumb: fileUrl(file, "thumb"),
    display: fileUrl(file, "display"),
    original: fileUrl(file, "original"),
    poster: file.variants.includes("poster") ? fileUrl(file, "poster") : null,
    download: `${fileUrl(file, "original")}?download`,
  };
}

/** The best small image for a submission: the first file's thumbnail (or poster for videos). */
export function thumbFor(files: FileRow[] | undefined): string | null {
  const first = files?.find((f) => f.kind === "image" || f.variants.includes("thumb"));
  return first ? fileUrl(first, "thumb") : null;
}
