"use client";

import { Download, FileText, MapPin, ZoomIn, ZoomOut } from "lucide-react";
import { type MouseEvent, memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MediaFile } from "@/lib/judging/types";
import { cn } from "@/lib/utils";
import { Img } from "./img";

/*
 * The light table: a submission's photos and videos, as large as the space
 * allows. Click a photo to see the original at full resolution (click again
 * to fit); several files get a filmstrip and ← → keys.
 */

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

function MediaStageImpl({
  files,
  alt,
  className,
  fitClassName = "max-h-[60dvh] lg:max-h-[calc(100dvh-15rem)]",
  zoomClassName = "h-[60dvh] lg:h-[calc(100dvh-15rem)]",
  keyboard = true,
}: {
  files: MediaFile[];
  /** Describes the photo, e.g. "Night Owls’ photo for 31 The red door". */
  alt: string;
  className?: string;
  /** Size limit for the fitted (not zoomed) photo or video. */
  fitClassName?: string;
  /** Height of the pannable window while zoomed in (match the fitted size so nothing jumps). */
  zoomClassName?: string;
  /** Listen for ← → to switch files. */
  keyboard?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const focusPoint = useRef<{ x: number; y: number } | null>(null);
  const file = files[Math.min(index, files.length - 1)];

  useEffect(() => {
    if (!keyboard || files.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % files.length);
      else if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + files.length) % files.length);
      else return;
      setZoomed(false);
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, files.length]);

  // Esc fits a zoomed photo back to the screen.
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || isTyping(e.target)) return;
      if (document.querySelector("dialog[open]")) return;
      setZoomed(false);
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  // Keep the spot that was clicked under the pointer after zooming in.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const point = focusPoint.current;
    if (!zoomed || !stage || !point) return;
    const img = stage.querySelector("img");
    if (!img) return;
    stage.scrollLeft = point.x * img.offsetWidth - stage.clientWidth / 2;
    stage.scrollTop = point.y * img.offsetHeight - stage.clientHeight / 2;
    focusPoint.current = null;
  }, [zoomed]);

  if (!file) return null;

  const toggleZoom = (e: MouseEvent<HTMLButtonElement>) => {
    if (!zoomed) {
      const img = e.currentTarget.querySelector("img");
      const rect = (img ?? e.currentTarget).getBoundingClientRect();
      // Keyboard activation reports 0,0: zoom into the middle.
      focusPoint.current =
        e.clientX === 0 && e.clientY === 0
          ? { x: 0.5, y: 0.5 }
          : {
              x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
              y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
            };
    }
    setZoomed((z) => !z);
  };

  const canZoom = file.kind === "image" && (file.width == null || file.width > 0);

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <div
        ref={stageRef}
        className={cn(
          // "Safe" centering: a zoomed photo larger than the window starts at its
          // top-left edge instead of overflowing both ways, so every part can be scrolled to.
          "relative grid min-h-48 place-items-center-safe rounded-lg",
          zoomed ? cn("overflow-auto overscroll-contain bg-mist-2", zoomClassName) : "overflow-hidden",
        )}
      >
        {file.kind === "image" ? (
          <button
            type="button"
            onClick={toggleZoom}
            disabled={!canZoom}
            aria-label={zoomed ? "Fit the photo to the screen" : "Zoom in to the original photo"}
            className={cn(
              "group relative block rounded-md focus-visible:outline-offset-4",
              zoomed ? "cursor-zoom-out" : "cursor-zoom-in",
            )}
          >
            {zoomed ? (
              <Img
                key={`${file.id}-original`}
                src={file.original}
                alt={alt}
                width={file.width ?? undefined}
                height={file.height ?? undefined}
                loading="eager"
                className="max-w-none bg-mist-2"
                // The display copy (already loaded) stands in, stretched, while the original arrives.
                style={{ backgroundImage: `url(${file.display})`, backgroundSize: "100% 100%" }}
              />
            ) : (
              <Img
                key={`${file.id}-display`}
                src={file.display}
                alt={alt}
                loading="eager"
                width={file.width ?? undefined}
                height={file.height ?? undefined}
                className={cn("h-auto w-auto max-w-full rounded-md object-contain", fitClassName)}
              />
            )}
            <span
              aria-hidden
              className="absolute right-2 bottom-2 grid size-9 place-items-center rounded-full bg-paper/90 text-ink opacity-0 shadow-pop transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              {zoomed ? <ZoomOut className="size-4" /> : <ZoomIn className="size-4" />}
            </span>
          </button>
        ) : null}
        {file.kind === "video" ? (
          // biome-ignore lint/a11y/useMediaCaption: team-recorded proof clips have no captions
          <video
            key={file.id}
            controls
            playsInline
            preload="metadata"
            poster={file.poster ?? undefined}
            src={file.original}
            className={cn("w-auto max-w-full rounded-md bg-ink", fitClassName)}
          />
        ) : null}
        {file.kind === "audio" ? (
          // biome-ignore lint/a11y/useMediaCaption: team-recorded audio has no captions
          <audio key={file.id} controls preload="metadata" src={file.original} className="w-full max-w-md" />
        ) : null}
        {file.kind === "document" ? (
          <a
            href={file.original}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md bg-paper px-4 py-3 font-semibold underline decoration-2 underline-offset-2"
          >
            <FileText className="size-5" aria-hidden />
            Open {file.name ?? "the document"}
          </a>
        ) : null}
      </div>

      {files.length > 1 ? (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {files.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setIndex(i);
                setZoomed(false);
              }}
              aria-label={`Show file ${i + 1} of ${files.length}${f.kind === "video" ? " (video)" : ""}`}
              aria-current={i === index ? "true" : undefined}
              className={cn(
                "relative size-14 shrink-0 overflow-hidden rounded-sm bg-mist-2 ring-offset-2 ring-offset-mist transition-shadow",
                i === index ? "ring-3 ring-accent" : "opacity-75 hover:opacity-100",
              )}
            >
              {f.kind === "image" || f.poster ? (
                <Img src={f.thumb} alt="" className="size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center text-xs font-semibold text-ink-2">
                  {f.kind === "video" ? "Video" : "File"}
                </span>
              )}
              {f.kind === "video" ? (
                <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-0.5 text-center text-[0.65rem] font-semibold text-paper">
                  Video
                </span>
              ) : null}
            </button>
          ))}
          <span className="ml-1 shrink-0 text-sm text-ink-2">
            {index + 1} of {files.length}
          </span>
        </div>
      ) : null}

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
        <a
          href={file.download}
          className="inline-flex items-center gap-1.5 font-medium text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink"
        >
          <Download className="size-4" aria-hidden />
          Download original
        </a>
        {file.kind === "image" && file.width && file.height ? (
          <span>
            {file.width} × {file.height}
          </span>
        ) : null}
      </p>
    </div>
  );
}

/** The team's answer, code or note, set large enough to read from arm's length. */
export function SubmissionText({
  text,
  kind,
  prominent,
  className,
}: {
  text: string;
  kind: "answer" | "checkpoint" | "note";
  /** No media: the text is the whole submission. */
  prominent?: boolean;
  className?: string;
}) {
  const label = kind === "answer" ? "Answer" : kind === "checkpoint" ? "Code typed" : "Note from the team";
  return (
    <figure className={cn("flex flex-col gap-1.5", className)}>
      <figcaption className="text-sm font-semibold text-ink-2">{label}</figcaption>
      <blockquote
        className={cn(
          "rounded-lg bg-paper px-4 py-3 break-words whitespace-pre-wrap text-ink",
          prominent
            ? "font-cond text-4xl leading-tight font-bold tracking-tight sm:text-5xl"
            : "text-lg leading-relaxed",
        )}
      >
        {text}
      </blockquote>
    </figure>
  );
}

/** "Open in map" for submissions sent with the device's location. */
export function LocationLink({
  lat,
  lng,
  accuracy,
  className,
}: {
  lat: number;
  lng: number;
  accuracy: number | null;
  className?: string;
}) {
  const href = `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lng.toFixed(6)}#map=18/${lat.toFixed(6)}/${lng.toFixed(6)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 font-medium text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink",
        className,
      )}
    >
      <MapPin className="size-4" aria-hidden />
      Open location in map
      {accuracy != null ? <span className="text-ink-3">(within {Math.round(accuracy)} m)</span> : null}
    </a>
  );
}

export const MediaStage = memo(MediaStageImpl);
