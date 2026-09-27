/*
 * Getting photos and videos ready on the phone before they're uploaded:
 * big camera photos are shrunk (and HEIC turned into JPEG where the browser
 * can decode it), and a poster frame is captured from videos so judges and
 * the history list get a thumbnail. Browser-only; never throws — anything
 * the browser can't handle is sent as it was taken.
 */

export type MediaKind = "image" | "video";

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|3gp|3g2|mkv|avi|ogv)$/i;

/** image or video, from the MIME type (or the file name when a picker leaves the type empty). */
export function mediaKindOf(file: Pick<File, "type" | "name">): MediaKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (IMAGE_EXT.test(file.name)) return "image";
  if (VIDEO_EXT.test(file.name)) return "video";
  return null;
}

export type PreparedFile = { blob: Blob; name: string; type: string };

const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.85;
/** Photos under this size that are already web formats are sent untouched. */
const SMALL_ENOUGH = 1.5 * 1024 * 1024;
const WEB_FORMATS = /^image\/(jpeg|png|webp)$/;

function original(file: File): PreparedFile {
  return { blob: file, name: file.name || "photo", type: file.type };
}

function withExtension(name: string, ext: string): string {
  const base = name.replace(/\.[^./\\]+$/, "") || "photo";
  return `${base}.${ext}`;
}

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decode(file: File): Promise<Decoded | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Fall back to an <img>, which also honours EXIF orientation in current browsers.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) return null;
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => {} };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function toJpeg(source: CanvasImageSource, width: number, height: number, quality: number): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // JPEG has no transparency; paint white under PNG cut-outs instead of black.
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(source, 0, 0, width, height);
        return await canvas.convertToBlob({ type: "image/jpeg", quality });
      }
    } catch {
      // Some browsers expose OffscreenCanvas without 2D support; use a DOM canvas.
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Shrinks a photo to at most 2048 px on its longest edge as a JPEG (quality
 * 0.85), upright. Small photos in web formats and GIFs are left alone, and
 * the original is returned whenever the browser can't decode the file (e.g.
 * HEIC in Chrome) — the server accepts it as it is.
 */
export async function compressImage(file: File): Promise<PreparedFile> {
  if (file.type === "image/gif") return original(file);
  if (file.size <= SMALL_ENOUGH && WEB_FORMATS.test(file.type)) return original(file);
  const decoded = await decode(file);
  if (!decoded) return original(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const blob = await toJpeg(decoded.source, width, height, JPEG_QUALITY);
    if (!blob || blob.size === 0) return original(file);
    // Already-lean web images can come out bigger; keep whichever is smaller.
    if (blob.size >= file.size && WEB_FORMATS.test(file.type)) return original(file);
    return { blob, name: withExtension(file.name || "photo", "jpg"), type: "image/jpeg" };
  } catch {
    return original(file);
  } finally {
    decoded.release();
  }
}

function waitFor(target: HTMLVideoElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("video error"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      target.removeEventListener("error", onError);
    };
    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

/**
 * A JPEG frame from about half a second into a video (or its middle, for
 * very short clips), at most 960 px wide. Null when the browser can't decode
 * the video.
 */
export async function capturePoster(file: File, atSeconds = 0.5): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await waitFor(video, "loadedmetadata", 8000);
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const target = duration > 0 ? Math.min(atSeconds, duration / 2) : 0;
    try {
      video.currentTime = target;
      await waitFor(video, "seeked", 5000);
    } catch {
      // iOS sometimes won't seek before playback starts: nudge it.
      await video.play().catch(() => {});
      await waitFor(video, "timeupdate", 4000).catch(() => {});
      video.pause();
    }
    if (video.readyState < 2) await waitFor(video, "loadeddata", 4000);
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const scale = Math.min(1, 960 / Math.max(w, h));
    return await toJpeg(video, Math.round(w * scale), Math.round(h * scale), 0.8);
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** "photo", "2 photos", "photo and video" … for button labels and messages. */
export function describeMedia(kinds: MediaKind[]): string {
  const photos = kinds.filter((k) => k === "image").length;
  const videos = kinds.filter((k) => k === "video").length;
  const parts: string[] = [];
  if (photos) parts.push(photos === 1 ? "photo" : "photos");
  if (videos) parts.push(videos === 1 ? "video" : "videos");
  return parts.join(" and ");
}

/** With counts where there's more than one: "photo", "2 photos", "photo and 2 videos". */
export function countMedia(kinds: MediaKind[]): string {
  const photos = kinds.filter((k) => k === "image").length;
  const videos = kinds.filter((k) => k === "video").length;
  const parts: string[] = [];
  if (photos) parts.push(photos === 1 ? "photo" : `${photos} photos`);
  if (videos) parts.push(videos === 1 ? "video" : `${videos} videos`);
  return parts.join(" and ");
}
