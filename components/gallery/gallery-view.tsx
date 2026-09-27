"use client";

import { Play } from "lucide-react";
import { useState } from "react";
import { ControlMarker } from "@/components/ui/control";
import { TeamAvatar } from "@/components/ui/team-badge";
import { describeMedia, type FeedTask, type FeedTeam, type GalleryItem } from "@/lib/live/types";
import { cn } from "@/lib/utils";
import { Lightbox } from "./lightbox";

export type GalleryGroup =
  | { key: string; by: "task"; task: FeedTask; items: GalleryItem[] }
  | { key: string; by: "team"; team: FeedTeam; items: GalleryItem[] };

const THUMB_MAX = 480;

/** Width ÷ height, kept within a range so panoramas and tall screenshots stay reasonable tiles. */
function ratioOf(item: Pick<GalleryItem, "width" | "height" | "kind">): number {
  if (item.width && item.height) return Math.min(2.2, Math.max(0.55, item.width / item.height));
  return item.kind === "video" ? 16 / 9 : 4 / 3;
}

/** Intrinsic size of the thumbnail (≤480 px on the long side) for width/height attributes. */
function thumbSize(item: GalleryItem): { width: number; height: number } {
  const r = ratioOf(item);
  return r >= 1
    ? { width: THUMB_MAX, height: Math.round(THUMB_MAX / r) }
    : { width: Math.round(THUMB_MAX * r), height: THUMB_MAX };
}

/**
 * The gallery: one section per task (or team), each a justified row layout
 * that keeps every photo's shape. Tapping a photo opens the lightbox, which
 * steps through all photos on the page in order.
 */
export function GalleryView({ groups, timezone }: { groups: GalleryGroup[]; timezone: string }) {
  const all = groups.flatMap((g) => g.items);
  const [open, setOpen] = useState<number | null>(null);
  let offset = 0;

  return (
    <>
      <div className="flex flex-col gap-9">
        {groups.map((group) => {
          const start = offset;
          offset += group.items.length;
          return (
            <section key={group.key} aria-labelledby={`g-${group.key}`}>
              <h2 id={`g-${group.key}`} className="mb-3 flex min-w-0 items-center gap-3">
                {group.by === "task" ? (
                  // The plain control ring: a heading names the task, it isn't the viewer's result.
                  <ControlMarker code={group.task.code} size="sm" label={`Task ${group.task.code}`} />
                ) : (
                  <TeamAvatar team={group.team} />
                )}
                <span className="min-w-0 truncate font-cond text-2xl font-bold">
                  {group.by === "task" ? group.task.title : group.team.name}
                </span>
                <span className="ml-auto shrink-0 text-sm text-ink-2">{describeMedia(group.items)}</span>
              </h2>
              <ul className="flex flex-wrap gap-1.5 [--row:7.5rem] sm:[--row:10.5rem]">
                {group.items.map((item, j) => (
                  <Tile
                    key={item.id}
                    item={item}
                    badge={group.by === "task" ? "team" : "task"}
                    onOpen={() => setOpen(start + j)}
                  />
                ))}
                {/* Soaks up the last row's spare width so its photos keep their size. */}
                <li aria-hidden className="h-0 grow-[1000]" />
              </ul>
            </section>
          );
        })}
      </div>
      <Lightbox items={all} index={open} timezone={timezone} onIndex={setOpen} onClose={() => setOpen(null)} />
    </>
  );
}

function Tile({ item, badge, onOpen }: { item: GalleryItem; badge: "team" | "task"; onOpen: () => void }) {
  const ratio = ratioOf(item);
  const { width, height } = thumbSize(item);
  const label = `${item.kind === "video" ? "Video" : "Photo"} by ${item.team.name} for ${item.task.title}`;
  return (
    <li className="relative min-w-0" style={{ flexGrow: ratio * 100, flexBasis: `calc(var(--row) * ${ratio})` }}>
      <a
        href={item.kind === "video" ? item.original : (item.display ?? item.original)}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          onOpen();
        }}
        aria-label={label}
        className="group relative block overflow-hidden rounded-sm bg-mist"
        style={{ aspectRatio: String(ratio) }}
      >
        {item.thumb ? (
          // biome-ignore lint/performance/noImgElement: access-checked /files URLs, already resized at upload
          <img
            src={item.thumb}
            alt=""
            width={width}
            height={height}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-[filter] duration-150 group-hover:brightness-95"
          />
        ) : (
          // A video without a poster: let the browser show its first frame.
          <video src={item.original} preload="metadata" muted playsInline className="size-full object-cover" />
        )}
        {item.kind === "video" ? (
          <span
            aria-hidden
            className="absolute top-1/2 left-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-paper/85 text-ink"
          >
            <Play className="size-5 translate-x-px fill-current" />
          </span>
        ) : null}
        <span
          aria-hidden
          className={cn(
            "absolute bottom-1.5 left-1.5 flex items-center rounded-full bg-paper/90",
            badge === "team" ? "p-0.5" : "p-px",
          )}
        >
          {badge === "team" ? (
            <TeamAvatar team={item.team} size="sm" />
          ) : (
            <ControlMarker code={item.task.code} state="approved" size="sm" className="size-7" />
          )}
        </span>
      </a>
    </li>
  );
}
