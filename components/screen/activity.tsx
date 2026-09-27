"use client";

import { Megaphone } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ControlMarker } from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/countdown";
import { TeamAvatar } from "@/components/ui/team-badge";
import { formatSigned } from "@/lib/format";
import type { FeedItem, FeedPunch } from "@/lib/live/types";
import { cn } from "@/lib/utils";

/** "punched" for tasks, "entered" for contests (entries compete for places). */
function verb(item: FeedPunch) {
  return item.task.kind === "contest" ? "entered" : "punched";
}

/** Big recent-activity entries: the right column when photos can't be shown. */
export function ActivityList({ items, serverNow }: { items: FeedItem[]; serverNow: number }) {
  const recent = items.slice(0, 5);
  if (recent.length === 0) {
    return (
      <p className="rounded-lg bg-mist px-6 py-8 text-[1.4rem] text-ink-2">
        Accepted tasks show up here the moment a judge approves them.
      </p>
    );
  }
  return (
    <ol aria-label="Latest" className="flex min-h-0 flex-1 flex-col divide-y divide-line overflow-hidden">
      {recent.map((item) => (
        <li key={`${item.kind}:${item.id}`} className="flex items-center gap-5 py-4 first:pt-0">
          {item.kind === "punch" ? (
            <>
              <ControlMarker code={item.task.code} state="approved" size="lg" className="size-[4rem]" />
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-2.5">
                  <TeamAvatar team={item.team} className="size-[2.2rem] text-[1.25rem]" />
                  <span className="truncate font-cond text-[1.9rem] leading-tight font-extrabold">
                    {item.team.name}
                  </span>
                </p>
                <p className="mt-1 truncate text-[1.25rem] text-ink-2">
                  {verb(item)} <span className="font-semibold text-ink">{item.task.title}</span>
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {item.points ? (
                  <span className="font-bib text-[2.4rem] leading-none text-accent">{formatSigned(item.points)}</span>
                ) : null}
                <RelativeTime at={item.at} serverNow={serverNow} className="text-[1rem] text-ink-2" />
              </div>
            </>
          ) : (
            <>
              <span className="grid size-[4rem] shrink-0 place-items-center rounded-full bg-water-wash text-water">
                <Megaphone aria-hidden className="size-[1.8rem]" />
              </span>
              <div className="min-w-0 flex-1">
                {item.title ? <p className="truncate text-[1.5rem] font-bold">{item.title}</p> : null}
                <p className={cn("line-clamp-2 text-[1.25rem]", item.title ? "text-ink-2" : "font-semibold")}>
                  {item.body}
                </p>
              </div>
              <RelativeTime at={item.at} serverNow={serverNow} className="shrink-0 self-start text-[1rem] text-ink-2" />
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

const TICKER_PX_PER_S = 90;

/**
 * The crawl along the bottom of the screen: recent punches and
 * announcements. Scrolls continuously; with reduced motion it shows the
 * newest items still, and changes them every few seconds.
 */
export function Ticker({ items }: { items: FeedItem[] }) {
  const recent = items.slice(0, 14);
  const track = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(false);
  const [still, setStill] = useState(0);
  const signature = recent.map((i) => i.id).join(",");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // New items restart the crawl from the newest. When the track changes size
  // (the web font arriving after the first measurement, a resized window) the
  // loop is re-measured and carries on from where it was, so it never jumps.
  // biome-ignore lint/correctness/useExhaustiveDependencies: restart the crawl when the items change
  useEffect(() => {
    const el = track.current;
    if (!el || reduced || recent.length === 0) return;
    let animation: Animation | null = null;
    let width = 0;
    const start = () => {
      const half = el.scrollWidth / 2;
      if (animation && Math.abs(half - width) < 1) return;
      width = half;
      const progress = animation?.effect?.getComputedTiming().progress ?? 0;
      animation?.cancel();
      const duration = (half / TICKER_PX_PER_S) * 1000;
      animation = el.animate([{ transform: "translateX(0)" }, { transform: `translateX(-${half}px)` }], {
        duration,
        iterations: Number.POSITIVE_INFINITY,
        easing: "linear",
      });
      animation.currentTime = (progress ?? 0) * duration;
    };
    start();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(start);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      animation?.cancel();
    };
  }, [signature, reduced]);

  useEffect(() => {
    if (!reduced || recent.length <= 2) return;
    const t = setInterval(() => setStill((s) => (s + 2) % recent.length), 7000);
    return () => clearInterval(t);
  }, [reduced, recent.length]);

  if (recent.length === 0) return null;
  const entries = recent.map((item) => <TickerEntry key={`${item.kind}:${item.id}`} item={item} />);

  return (
    // Entries fade out as they leave (and in as they arrive) rather than being sliced mid-word next to
    // the label; each one starts clear of the fade.
    <div className="flex min-w-0 flex-1 items-center overflow-hidden pl-20 [mask-image:linear-gradient(to_right,transparent,black_5rem,black_calc(100%-2.5rem),transparent)]">
      {reduced ? (
        <div className="flex min-w-0 items-center gap-10 overflow-hidden">{entries.slice(still, still + 2)}</div>
      ) : (
        <div ref={track} className="flex w-max items-center" aria-hidden>
          {/* Two copies for a seamless loop. */}
          <div className="flex items-center">{withSeparators(entries, "a")}</div>
          <div className="flex items-center">{withSeparators(entries, "b")}</div>
        </div>
      )}
      {!reduced ? (
        <ul className="sr-only">
          {recent.map((item) => (
            <li key={item.id}>
              {item.kind === "punch"
                ? `${item.team.name} ${verb(item)} ${item.task.code} ${item.task.title}`
                : (item.title ?? item.body)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function withSeparators(entries: ReactNode[], copy: string) {
  return entries.flatMap((entry, i) => [
    // biome-ignore lint/suspicious/noArrayIndexKey: static decoration between entries
    <span key={`${copy}-${i}`} className="flex items-center">
      {entry}
      <svg viewBox="0 0 10 10" aria-hidden className="mx-8 size-[0.9rem] text-accent">
        <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </span>,
  ]);
}

function TickerEntry({ item }: { item: FeedItem }) {
  if (item.kind === "announcement") {
    return (
      <span className="flex shrink-0 items-center gap-3 text-[1.3rem] whitespace-nowrap">
        <Megaphone aria-hidden className="size-[1.4rem] text-water" />
        {item.title ? <span className="font-bold">{item.title}</span> : null}
        <span className={item.title ? "text-ink-2" : "font-semibold"}>{truncate(item.body, 110)}</span>
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-3 text-[1.3rem] whitespace-nowrap">
      <TeamAvatar team={item.team} className="size-[2rem] text-[1.1rem]" />
      <span className="font-bold">{item.team.name}</span>
      <span className="text-ink-2">{verb(item)}</span>
      <ControlMarker code={item.task.code} state="approved" size="sm" className="size-[1.9rem]" />
      <span className="font-semibold">{item.task.title}</span>
      {item.points ? <span className="font-bib text-[1.6rem] text-accent">{formatSigned(item.points)}</span> : null}
    </span>
  );
}

function truncate(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}
