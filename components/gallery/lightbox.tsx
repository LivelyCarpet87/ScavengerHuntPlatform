"use client";

import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { buttonClass } from "@/components/ui/button";
import { ControlMarker } from "@/components/ui/control";
import { TeamAvatar } from "@/components/ui/team-badge";
import { formatDate, formatTime } from "@/lib/format";
import type { GalleryItem } from "@/lib/live/types";
import { cn } from "@/lib/utils";

const SWIPE_PX = 50;

/**
 * Full-screen viewer for the gallery: the display-size photo (or the video,
 * playable), previous/next with the arrow keys, swipe or buttons, Esc to
 * close, and a download of the original file. Built on <dialog>, so focus
 * stays inside and returns to the photo that opened it.
 */
export function Lightbox({
  items,
  index,
  timezone,
  onIndex,
  onClose,
}: {
  items: GalleryItem[];
  /** The open item, or null when closed. */
  index: number | null;
  timezone: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const open = index != null && items.length > 0;
  const i = open ? Math.min(Math.max(index, 0), items.length - 1) : 0;
  const item = open ? items[i] : null;
  const count = items.length;
  const prev = () => onIndex((i - 1 + count) % count);
  const next = () => onIndex((i + 1) % count);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // Preload the neighbours so stepping through feels instant.
  useEffect(() => {
    if (!open || count < 2) return;
    for (const n of [items[(i + 1) % count], items[(i - 1 + count) % count]]) {
      if (n?.kind === "image" && n.display) {
        const img = new Image();
        img.src = n.display;
      }
    }
  }, [open, i, count, items]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // A focused video uses the arrow keys to seek.
    if (count < 2 || e.target instanceof HTMLVideoElement) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    }
  };

  const at = item ? new Date(item.at) : null;

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onKeyDown={onKeyDown}
      aria-label={item ? `${item.team.name}: ${item.task.title}` : "Photo"}
      className="m-0 size-full max-h-none max-w-none bg-paper p-0 text-ink backdrop:bg-paper"
    >
      {item && at ? (
        <div className="flex h-dvh flex-col">
          <header className="flex shrink-0 items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 sm:px-4">
            <button type="button" onClick={onClose} className={buttonClass("ghost", "icon")} aria-label="Close">
              <X aria-hidden className="size-6" />
            </button>
            <p className="font-bib text-lg text-ink-2" aria-hidden>
              {i + 1}
              <span className="px-1 font-sans text-sm font-medium">of</span>
              {count}
            </p>
            {/* Stepping announces the whole position, not just the number that changed. */}
            <p className="sr-only" aria-live="polite" aria-atomic="true">
              {`${item.kind === "video" ? "Video" : "Photo"} ${i + 1} of ${count}: ${item.team.name}, ${item.task.title}`}
            </p>
            <a href={`${item.original}?download=1`} download className={buttonClass("quiet", "sm", "ml-auto h-11")}>
              <Download aria-hidden />
              Download original
            </a>
          </header>

          <div
            className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center px-2 select-none sm:px-16"
            onPointerDown={(e) => {
              if (e.pointerType !== "mouse") swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
            }}
            onPointerUp={(e) => {
              const start = swipe.current;
              swipe.current = null;
              if (!start || start.id !== e.pointerId || count < 2) return;
              const dx = e.clientX - start.x;
              if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - start.y)) {
                if (dx < 0) next();
                else prev();
              }
            }}
            onPointerCancel={() => {
              swipe.current = null;
            }}
          >
            {item.kind === "video" ? (
              // biome-ignore lint/a11y/useMediaCaption: player-made clips have no captions
              <video
                key={item.id}
                src={item.original}
                poster={item.display ?? undefined}
                controls
                playsInline
                preload="metadata"
                className="max-h-full max-w-full rounded-md bg-mist"
              />
            ) : (
              // biome-ignore lint/performance/noImgElement: access-checked /files URLs, already resized at upload
              <img
                key={item.id}
                src={item.display ?? item.original}
                alt={`${item.team.name}, ${item.task.title}`}
                width={item.width ?? undefined}
                height={item.height ?? undefined}
                draggable={false}
                className="h-auto max-h-full w-auto max-w-full rounded-md object-contain"
              />
            )}
            {count > 1 ? (
              <>
                <button
                  type="button"
                  onClick={prev}
                  aria-label="Previous photo"
                  className={cn(buttonClass("quiet", "icon"), "absolute left-2 hidden rounded-full sm:inline-flex")}
                >
                  <ChevronLeft aria-hidden className="size-6" />
                </button>
                <button
                  type="button"
                  onClick={next}
                  aria-label="Next photo"
                  className={cn(buttonClass("quiet", "icon"), "absolute right-2 hidden rounded-full sm:inline-flex")}
                >
                  <ChevronRight aria-hidden className="size-6" />
                </button>
              </>
            ) : null}
          </div>

          <footer className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            <TeamAvatar team={item.team} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{item.team.name}</p>
              <p className="flex min-w-0 items-center gap-1.5 text-sm text-ink-2">
                <ControlMarker code={item.task.code} state="approved" size="sm" className="size-6" />
                <span className="truncate">{item.task.title}</span>
              </p>
            </div>
            <time dateTime={item.at} className="shrink-0 text-right text-sm text-ink-2">
              <span className="block font-bib text-lg text-ink">{formatTime(at, timezone)}</span>
              {formatDate(at, timezone)}
            </time>
            {count > 1 ? (
              <div className="flex gap-1 sm:hidden">
                <button
                  type="button"
                  onClick={prev}
                  aria-label="Previous photo"
                  className={buttonClass("quiet", "icon")}
                >
                  <ChevronLeft aria-hidden className="size-6" />
                </button>
                <button type="button" onClick={next} aria-label="Next photo" className={buttonClass("quiet", "icon")}>
                  <ChevronRight aria-hidden className="size-6" />
                </button>
              </div>
            ) : null}
          </footer>
        </div>
      ) : null}
    </dialog>
  );
}
