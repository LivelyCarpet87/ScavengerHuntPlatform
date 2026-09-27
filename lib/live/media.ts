import "server-only";
import type { FileRow } from "@/lib/db/schema";
import { filesFor, fileUrl } from "@/lib/storage";
import type { FeedMedia } from "./types";

/** Photo/video attachment → URLs for every size the live views need. Other file kinds are skipped. */
export function toMedia(file: FileRow): FeedMedia | null {
  if (file.kind !== "image" && file.kind !== "video") return null;
  const still = (variant: "thumb" | "display" | "poster") =>
    file.variants.includes(variant) ? fileUrl(file, variant) : null;
  if (file.kind === "image") {
    return {
      id: file.id,
      kind: "image",
      thumb: fileUrl(file, "thumb"),
      display: fileUrl(file, "display"),
      original: fileUrl(file, "original"),
      width: file.width,
      height: file.height,
    };
  }
  return {
    id: file.id,
    kind: "video",
    thumb: still("thumb") ?? still("poster"),
    display: still("poster") ?? still("thumb"),
    original: fileUrl(file, "original"),
    width: file.width,
    height: file.height,
  };
}

/** submissionId → its photos and videos, in upload order. */
export async function mediaForSubmissions(submissionIds: string[]): Promise<Record<string, FeedMedia[]>> {
  const bySubmission = await filesFor("submission", submissionIds);
  const out: Record<string, FeedMedia[]> = {};
  for (const [id, rows] of Object.entries(bySubmission)) {
    const media = rows.map(toMedia).filter((m): m is FeedMedia => m !== null);
    if (media.length > 0) out[id] = media;
  }
  return out;
}
