"use client";

import { ChevronLeft, ChevronRight, ImageIcon, Play, Video } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PlainImg } from "./plain-img";

export type MediaItem = {
  id: string;
  kind: "image" | "video" | "audio" | "document";
  /** Small preview (photo thumbnail or video poster); null when there is none. */
  thumb: string | null;
  /** Large view for photos. */
  display: string;
  /** The file as uploaded (videos play from here). */
  original: string;
};

/** A tile's picture, or a plain icon when there's none or the browser can't show it (e.g. HEIC). */
function Thumb({ src, kind }: { src: string | null; kind: MediaItem["kind"] }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <span className="grid size-full place-items-center text-ink-2">
        {kind === "video" ? <Video aria-hidden className="size-6" /> : <ImageIcon aria-hidden className="size-6" />}
      </span>
    );
  }
  return (
    <PlainImg src={src} alt="" loading="lazy" className="size-full object-cover" onError={() => setBroken(true)} />
  );
}

/**
 * Thumbnails that open full size in a sheet. `gallery` shows pictures large,
 * two to a row (task attachments people need to look at); `sm`/`md` are
 * compact strips for submission history.
 */
export function MediaStrip({
  items,
  label,
  size = "md",
  className,
}: {
  items: MediaItem[];
  /** What these are, for screen readers and the viewer title, e.g. "Your photo". */
  label: string;
  size?: "sm" | "md" | "gallery";
  className?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (items.length === 0) return null;
  const current = open != null ? items[open] : null;
  const noun = (item: MediaItem) => (item.kind === "video" ? "video" : "photo");
  const gallery = size === "gallery";

  return (
    <>
      <ul className={cn(gallery ? "grid grid-cols-2 gap-2" : "flex flex-wrap gap-2", className)} aria-label={label}>
        {items.map((item, i) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              aria-label={`Open ${noun(item)} ${i + 1} of ${items.length}`}
              className={cn(
                "relative block overflow-hidden rounded-md bg-mist-2 transition-[filter] hover:brightness-95",
                gallery ? "aspect-[4/3] w-full border border-line" : size === "sm" ? "size-16" : "size-24",
              )}
            >
              <Thumb src={gallery && item.kind === "image" ? item.display : item.thumb} kind={item.kind} />
              {item.kind === "video" && item.thumb ? (
                <span className="absolute inset-0 grid place-items-center">
                  <span className="grid size-8 place-items-center rounded-full bg-ink/65 text-paper">
                    <Play aria-hidden className="size-4 translate-x-px fill-current" />
                  </span>
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      <Dialog
        open={current != null}
        onClose={() => setOpen(null)}
        title={current ? `${label}${items.length > 1 ? ` (${(open ?? 0) + 1} of ${items.length})` : ""}` : label}
        className="sm:max-w-2xl"
      >
        {current ? (
          <div className="flex flex-col gap-3">
            {current.kind === "video" ? (
              // biome-ignore lint/a11y/useMediaCaption: team-made clips have no caption track
              <video
                key={current.id}
                src={current.original}
                poster={current.thumb ?? undefined}
                controls
                playsInline
                preload="metadata"
                className="max-h-[65dvh] w-full rounded-md bg-ink"
              />
            ) : (
              <PlainImg
                key={current.id}
                src={current.display}
                alt={`${label}, ${noun(current)} ${(open ?? 0) + 1}`}
                className="max-h-[65dvh] w-full rounded-md bg-mist object-contain"
              />
            )}
            {items.length > 1 ? (
              <div className="flex justify-between gap-2">
                <Button
                  variant="quiet"
                  onClick={() => setOpen((i) => ((i ?? 0) - 1 + items.length) % items.length)}
                  aria-label="Previous"
                >
                  <ChevronLeft aria-hidden />
                  Previous
                </Button>
                <Button variant="quiet" onClick={() => setOpen((i) => ((i ?? 0) + 1) % items.length)} aria-label="Next">
                  Next
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
