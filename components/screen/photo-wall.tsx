"use client";

import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { ControlMarker } from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/countdown";
import { TeamAvatar } from "@/components/ui/team-badge";
import type { FeedTask, FeedTeam } from "@/lib/live/types";
import { cn } from "@/lib/utils";

export type WallPhoto = {
  key: string;
  src: string;
  thumb: string;
  video: boolean;
  team: FeedTeam;
  task: FeedTask;
  at: string;
};

const ROTATE_MS = 8000;

/**
 * The latest accepted photos, one at a time, crossfading every 8 s. A new
 * photo jumps the queue. The strip below shows what's coming up.
 */
export function PhotoWall({ photos, serverNow }: { photos: WallPhoto[]; serverNow: number }) {
  const [index, setIndex] = useState(0);
  const newest = photos[0]?.key;
  const count = photos.length;

  // A fresh photo arrives: show it now.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `newest` is the trigger
  useEffect(() => setIndex(0), [newest]);

  useEffect(() => {
    if (count <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(t);
  }, [count]);

  const current = photos[Math.min(index, count - 1)];
  const upcoming = count > 1 ? [1, 2, 3, 4].map((n) => photos[(index + n) % count]).slice(0, count - 1) : [];

  // Warm the cache for the next photo so the crossfade never waits on the network.
  const next = upcoming[0]?.src;
  useEffect(() => {
    if (!next) return;
    const img = new Image();
    img.src = next;
  }, [next]);

  if (!current) return null;
  return (
    <section aria-label="Latest photos" className="flex min-h-0 flex-1 flex-col gap-3">
      <figure className="relative aspect-[4/3] overflow-hidden rounded-lg bg-mist lg:aspect-auto lg:min-h-0 lg:flex-1">
        <Crossfade photo={current} />
        <figcaption className="absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-md bg-paper px-4 py-3">
          <TeamAvatar team={current.team} className="size-[2.6rem] text-[1.5rem]" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-cond text-[1.6rem] leading-tight font-extrabold">{current.team.name}</p>
            <p className="flex min-w-0 items-center gap-2 text-[1.05rem] text-ink-2">
              <ControlMarker code={current.task.code} state="approved" size="sm" className="size-[1.6rem]" />
              <span className="truncate">{current.task.title}</span>
            </p>
          </div>
          <RelativeTime at={current.at} serverNow={serverNow} className="shrink-0 text-[1rem] text-ink-2" />
        </figcaption>
      </figure>
      {upcoming.length > 0 ? (
        <ol aria-label="Coming up" className="grid shrink-0 grid-cols-4 gap-3">
          {upcoming.map((p) => (
            <li key={p.key} className="relative aspect-[4/3] overflow-hidden rounded-md bg-mist">
              {/* biome-ignore lint/performance/noImgElement: access-checked /files URLs, already resized at upload */}
              <img src={p.thumb} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
              {p.video ? <VideoGlyph className="size-8" /> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

/** New photo fades in over the previous one; the old one leaves once the fade is done. */
function Crossfade({ photo }: { photo: WallPhoto }) {
  const [layers, setLayers] = useState<{ photo: WallPhoto; loaded: boolean }[]>([{ photo, loaded: true }]);

  useEffect(() => {
    setLayers((ls) => (ls[ls.length - 1]?.photo.key === photo.key ? ls : [...ls.slice(-1), { photo, loaded: false }]));
  }, [photo]);

  const mark = (key: string, loaded: boolean) =>
    setLayers((ls) =>
      loaded ? ls.map((l) => (l.photo.key === key ? { ...l, loaded } : l)) : ls.filter((l) => l.photo.key !== key),
    );

  return (
    <>
      {layers.map((layer, i) => {
        const top = i === layers.length - 1;
        return (
          // biome-ignore lint/performance/noImgElement: access-checked /files URLs, already resized at upload
          <img
            key={layer.photo.key}
            src={layer.photo.src}
            alt={top ? `${layer.photo.team.name}: ${layer.photo.task.title}` : ""}
            decoding="async"
            onLoad={() => mark(layer.photo.key, true)}
            onError={() => (top && layers.length > 1 ? mark(layer.photo.key, false) : undefined)}
            onTransitionEnd={() => {
              if (top && layer.loaded) setLayers((ls) => ls.slice(-1));
            }}
            className={cn(
              "absolute inset-0 size-full object-cover transition-opacity duration-1000 ease-out",
              !top || layer.loaded ? "opacity-100" : "opacity-0",
            )}
            style={{ objectPosition: "50% 35%" }}
          />
        );
      })}
      {photo.video ? <VideoGlyph className="size-16" /> : null}
    </>
  );
}

function VideoGlyph({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute top-1/2 left-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-ink/70 text-paper",
        className,
      )}
    >
      <Play className="size-1/2 translate-x-[6%] fill-current" />
    </span>
  );
}
