import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Numeral, Ordinal } from "@/components/ui/bib";
import { ContourArt } from "@/components/ui/contour-art";
import { StartMark } from "@/components/ui/control";
import { LiveDot } from "@/components/ui/misc";
import { TeamAvatar } from "@/components/ui/team-badge";
import { formatDate, formatDateTime, formatPoints, formatTime } from "@/lib/format";
import type { DeviceHunt } from "@/lib/player/queries";

/** Hunts this device has joined, each with its terrain tile and the team's standing. */
export function YourHunts({ hunts }: { hunts: DeviceHunt[] }) {
  if (hunts.length === 0) return null;
  return (
    <section aria-labelledby="your-hunts" className="mx-auto max-w-xl px-4 pt-10">
      <h2 id="your-hunts" className="font-cond text-2xl font-bold tracking-tight">
        Your hunts
      </h2>
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {hunts.map((entry) => (
          <li key={entry.hunt.id}>
            <HuntRow entry={entry} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function HuntRow({ entry }: { entry: DeviceHunt }) {
  const { hunt, team, phase, standing } = entry;
  return (
    <Link
      href={`/h/${hunt.slug}`}
      className="group -mx-2 flex min-h-20 items-center gap-3.5 rounded-md px-2 py-3 transition-colors hover:bg-mist"
    >
      <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-paper">
        {/* A close-up of the hunt's terrain: the whole map squeezed into a tile is just noise. */}
        <ContourArt
          seed={hunt.id}
          strength="bold"
          className="inset-auto top-1/2 left-1/2 size-[360%] -translate-x-1/2 -translate-y-1/2"
        />
        <TeamAvatar team={team} size="md" className="relative" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-2 font-cond text-xl leading-tight font-bold break-words">{hunt.name}</span>
        <span className="truncate text-sm text-ink-2">{team.name}</span>
        <PhaseLine entry={entry} />
      </span>
      {standing && (phase === "live" || phase === "ended") ? (
        <span className="flex shrink-0 flex-col items-end text-right">
          {standing.rank != null ? (
            <>
              <span className="flex items-baseline gap-1">
                <Ordinal n={standing.rank} className="text-3xl leading-none" />
                <span className="text-sm text-ink-2">
                  {standing.tied ? "tied, " : ""}of {standing.teams}
                </span>
              </span>
              <span className="text-sm text-ink-2">
                <Numeral className="text-base text-ink">{formatPoints(standing.total)}</Numeral> points
              </span>
            </>
          ) : (
            <>
              <Numeral className="text-3xl leading-none">{formatPoints(standing.total)}</Numeral>
              <span className="text-sm text-ink-2">points</span>
            </>
          )}
        </span>
      ) : null}
      <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-3 transition-colors group-hover:text-ink" />
    </Link>
  );
}

function PhaseLine({ entry }: { entry: DeviceHunt }) {
  const { hunt, phase } = entry;
  const tz = hunt.timezone;
  if (phase === "live") {
    return (
      <span className="flex items-center gap-2 text-sm">
        <LiveDot label="Live now" />
        {hunt.endsAt ? <span className="text-ink-2">until {formatTime(hunt.endsAt, tz)}</span> : null}
      </span>
    );
  }
  if (phase === "upcoming") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-ink-2">
        <StartMark size={13} />
        {hunt.startsAt ? `Starts ${formatDateTime(hunt.startsAt, tz)}` : "Starting soon"}
      </span>
    );
  }
  if (phase === "draft") return <span className="text-sm text-ink-2">Draft, visible to staff only</span>;
  return (
    <span className="text-sm text-ink-2">{hunt.endsAt ? `Finished ${formatDate(hunt.endsAt, tz)}` : "Finished"}</span>
  );
}
