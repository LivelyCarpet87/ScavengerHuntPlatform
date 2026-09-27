import { ContourArt } from "@/components/ui/contour-art";
import { Countdown } from "@/components/ui/countdown";
import { LiveDot } from "@/components/ui/misc";
import type { FileRow, Hunt } from "@/lib/db/schema";
import type { HuntPhase } from "@/lib/hunts";
import { daysUntil } from "@/lib/player/join";
import { fileUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { ScheduleLegend } from "./schedule";

const DAY = 86_400_000;

/**
 * The hunt's generated map with its legend box: name, tagline, start and
 * finish, the number of controls, and the clock.
 */
export function HuntHero({
  hunt,
  phase,
  controls,
  cover,
  now,
  className,
}: {
  hunt: Pick<Hunt, "id" | "name" | "tagline" | "startsAt" | "endsAt" | "timezone">;
  phase: HuntPhase;
  controls: number;
  cover: FileRow | null;
  now: number;
  className?: string;
}) {
  // With a cover photo the legend overlaps its lower edge, like a legend box
  // pasted onto the map, so the page doesn't open on a wall of header.
  return (
    <section
      className={cn(
        "-mx-4 -mt-5 overflow-hidden border-b border-line sm:mx-0 sm:mt-0 sm:rounded-xl sm:border",
        className,
      )}
    >
      {cover ? (
        // biome-ignore lint/performance/noImgElement: access-checked upload with prebuilt variants; no optimizer round trip
        <img
          src={fileUrl(cover, "display")}
          alt=""
          width={cover.width ?? undefined}
          height={cover.height ?? undefined}
          className="aspect-[2/1] w-full border-b border-line object-cover sm:aspect-[3/1]"
        />
      ) : null}
      <div className={cn("relative px-4 pb-6 sm:px-8 sm:pb-8", cover ? "pt-0" : "pt-12 sm:pt-20")}>
        <ContourArt seed={hunt.id} />
        <div
          className={cn(
            "relative flex flex-col rounded-lg border border-ink bg-paper p-5 sm:max-w-xl sm:p-7",
            cover && "-mt-10 sm:-mt-16",
          )}
        >
          <h1 className="font-cond text-5xl leading-[0.92] font-extrabold tracking-tight break-words sm:text-7xl">
            {hunt.name}
          </h1>
          {hunt.tagline ? <p className="mt-3 text-lg leading-snug text-ink-2">{hunt.tagline}</p> : null}
          <ScheduleLegend hunt={hunt} phase={phase} controls={controls} className="mt-5 border-t border-line pt-4" />
          <HuntClock hunt={hunt} phase={phase} now={now} />
        </div>
      </div>
    </section>
  );
}

/** The big clock under the legend: time to the start, time left, or "finished". */
function HuntClock({
  hunt,
  phase,
  now,
}: {
  hunt: Pick<Hunt, "startsAt" | "endsAt" | "timezone">;
  phase: HuntPhase;
  now: number;
}) {
  let figure: React.ReactNode = null;
  let caption: React.ReactNode = null;

  if (phase === "upcoming" && hunt.startsAt) {
    const left = hunt.startsAt.getTime() - now;
    if (left > DAY) {
      const days = Math.max(1, daysUntil(hunt.startsAt, new Date(now), hunt.timezone));
      figure = <span className="font-bib">{days}</span>;
      caption = days === 1 ? "day to go" : "days to go";
    } else {
      figure = <Countdown to={hunt.startsAt.getTime()} serverNow={now} />;
      caption = "until the start";
    }
  } else if (phase === "live") {
    if (hunt.endsAt) {
      figure = <Countdown to={hunt.endsAt.getTime()} serverNow={now} />;
      caption = "left to play";
    } else {
      return (
        <div className="mt-5 border-t border-line pt-4">
          <LiveDot label="Live now" className="text-sm" />
        </div>
      );
    }
  } else if (phase === "ended" || phase === "archived") {
    return (
      <p className="mt-5 border-t border-line pt-4 font-cond text-2xl font-bold tracking-tight">
        This hunt has finished
      </p>
    );
  }
  if (!figure) return null;
  return (
    <div className="mt-5 flex items-end gap-3 border-t border-line pt-4">
      <span className="text-6xl leading-[0.85] sm:text-7xl">{figure}</span>
      <span className="pb-1 text-sm font-medium text-ink-2">{caption}</span>
    </div>
  );
}
