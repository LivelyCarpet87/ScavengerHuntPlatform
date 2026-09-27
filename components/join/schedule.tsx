import { FinishMark, StartMark } from "@/components/ui/control";
import type { Hunt } from "@/lib/db/schema";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import type { HuntPhase } from "@/lib/hunts";
import { cn } from "@/lib/utils";

type ScheduleHunt = Pick<Hunt, "startsAt" | "endsAt" | "timezone">;

/** "Starts Sat 27 Sep, 19:00" (or "Started …" once it has). Null without a start time. */
export function startText(hunt: ScheduleHunt, phase: HuntPhase): string | null {
  if (!hunt.startsAt) return null;
  const verb = phase === "upcoming" || phase === "draft" ? "Starts" : "Started";
  return `${verb} ${formatDateTime(hunt.startsAt, hunt.timezone)}`;
}

/** "Ends 21:30" on the start day, "Ends Sun 28 Sep, 01:00" otherwise; "Ended …" afterwards. */
export function endText(hunt: ScheduleHunt, phase: HuntPhase): string | null {
  if (!hunt.endsAt) return null;
  const verb = phase === "ended" || phase === "archived" ? "Ended" : "Ends";
  const sameDay = hunt.startsAt && formatDate(hunt.startsAt, hunt.timezone) === formatDate(hunt.endsAt, hunt.timezone);
  return `${verb} ${sameDay ? formatTime(hunt.endsAt, hunt.timezone) : formatDateTime(hunt.endsAt, hunt.timezone)}`;
}

/** The control-circle symbol, for "12 controls". */
export function ControlRing({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className={cn("shrink-0", className)}>
      <circle cx="50" cy="50" r="38" fill="none" stroke="var(--accent)" strokeWidth="9" />
    </svg>
  );
}

/**
 * The hunt's schedule as an orienteering map legend: start triangle, finish
 * double circle, and the number of controls.
 */
export function ScheduleLegend({
  hunt,
  phase,
  controls,
  className,
}: {
  hunt: ScheduleHunt;
  phase: HuntPhase;
  /** Number of tasks (controls); omitted when unknown. */
  controls?: number;
  className?: string;
}) {
  const start = startText(hunt, phase);
  const end = endText(hunt, phase);
  if (!start && !end && !controls) return null;
  return (
    <ul className={cn("flex flex-col gap-2.5 text-[0.9375rem]", className)}>
      {start ? (
        <li className="flex items-center gap-3">
          <StartMark size={20} />
          {start}
        </li>
      ) : null}
      {end ? (
        <li className="flex items-center gap-3">
          <FinishMark size={20} />
          {end}
        </li>
      ) : null}
      {controls ? (
        <li className="flex items-center gap-3">
          <ControlRing />
          {phase === "ended" || phase === "archived"
            ? `${controls} ${controls === 1 ? "control" : "controls"}`
            : `${controls} ${controls === 1 ? "control" : "controls"} to find`}
        </li>
      ) : null}
    </ul>
  );
}
