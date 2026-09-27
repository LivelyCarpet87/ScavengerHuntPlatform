"use client";

import { createContext, type ReactNode, useContext, useEffect, useId, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The time zone date fields are entered in. StaffShell provides the hunt's
 * zone, so organizers everywhere see (and type) the hunt's own clock; outside
 * a hunt, fields use the browser's zone.
 */
const TimeZoneContext = createContext<string | null>(null);

export function TimeZoneProvider({ timeZone, children }: { timeZone: string; children: ReactNode }) {
  return <TimeZoneContext.Provider value={timeZone}>{children}</TimeZoneContext.Provider>;
}

const pad = (n: number) => String(n).padStart(2, "0");
const pretty = (zone: string) => zone.replace(/_/g, " ");

/** Wall-clock parts of an instant in a zone (null for an unknown zone). */
function wallClock(ms: number, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(ms));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return {
      y: get("year"),
      mo: get("month"),
      d: get("day"),
      h: get("hour") % 24,
      mi: get("minute"),
      s: get("second"),
    };
  } catch {
    return null;
  }
}

/** ISO instant → the input's "YYYY-MM-DDTHH:mm", in `timeZone` or the browser's zone. */
export function toLocalInput(iso: string | null | undefined, timeZone?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const w = timeZone ? wallClock(d.getTime(), timeZone) : null;
  if (w) return `${w.y}-${pad(w.mo)}-${pad(w.d)}T${pad(w.h)}:${pad(w.mi)}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The input's wall-clock value → ISO instant, read in `timeZone` or the browser's zone. */
export function fromLocalInput(local: string, timeZone?: string | null): string {
  if (!local) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return "";
  if (timeZone && wallClock(0, timeZone)) {
    const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    // The zone's offset at an instant: its wall clock read as if it were UTC, minus the instant.
    const offset = (ms: number) => {
      const w = wallClock(ms, timeZone);
      return w ? Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - ms : 0;
    };
    const guess = wall - offset(wall);
    return new Date(wall - offset(guess)).toISOString();
  }
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/**
 * Date & time picker. Submits `name` as an ISO UTC string (or "" when
 * cleared), so the server never guesses time zones; parse it with
 * `zOptionalDate` from lib/actions. Values are shown and typed in the hunt's
 * zone inside StaffShell (or `timeZone` when given), otherwise in the
 * browser's zone; the line under the field says which.
 */
export function DateTimeField({
  name,
  label,
  hint,
  defaultValue,
  error,
  className,
  required,
  timeZone: zoneProp,
}: {
  name: string;
  label: string;
  hint?: string;
  /** ISO string */
  defaultValue?: string | null;
  error?: string | null;
  className?: string;
  required?: boolean;
  /** IANA zone the value is entered in; defaults to the hunt's zone (TimeZoneProvider). */
  timeZone?: string | null;
}) {
  const id = useId();
  const contextZone = useContext(TimeZoneContext);
  const timeZone = zoneProp ?? contextZone;
  // With a known zone the value renders on the server too; the browser's own zone is only known after mount.
  const [local, setLocal] = useState(() => (timeZone ? toLocalInput(defaultValue, timeZone) : ""));
  const [browserZone, setBrowserZone] = useState("");
  // Changing the zone keeps the wall-clock time that was typed (an organizer
  // fixing the hunt's zone means "19:00 there"); only a new saved value resets it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the zone at the time the value arrives is the one to show it in
  useEffect(() => setLocal(toLocalInput(defaultValue, timeZone)), [defaultValue]);
  useEffect(() => setBrowserZone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  const iso = fromLocalInput(local, timeZone);
  const elsewhere = !!timeZone && !!browserZone && timeZone !== browserZone;

  const hintId = hint ? `${id}-hint` : undefined;
  const zoneId = `${id}-zone`;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="-mt-1 text-sm text-ink-2">
          {hint}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="datetime-local"
          value={local}
          required={required}
          onChange={(e) => setLocal(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, zoneId, errorId].filter(Boolean).join(" ")}
          className="h-12 w-full min-w-0 rounded-md bg-mist px-3.5 text-base text-ink hover:bg-mist-2 focus:bg-paper focus:shadow-[inset_0_0_0_2px_var(--ink)] focus:outline-none aria-invalid:shadow-[inset_0_0_0_2px_var(--danger)] aria-invalid:focus:shadow-[inset_0_0_0_2px_var(--danger),0_0_0_2px_var(--paper),0_0_0_4px_var(--ink)]"
        />
        {local ? (
          <button
            type="button"
            onClick={() => setLocal("")}
            aria-label={`Clear ${label.toLowerCase()}`}
            className="h-12 shrink-0 rounded-md px-3 text-sm font-semibold text-ink-2 hover:bg-mist hover:text-ink"
          >
            Clear
          </button>
        ) : null}
      </div>
      <input type="hidden" name={name} value={iso} />
      <p id={zoneId} className="text-xs text-ink-3" suppressHydrationWarning>
        {timeZone
          ? `Hunt time (${pretty(timeZone)})${elsewhere && iso ? ` · ${formatDateTime(new Date(iso), browserZone)} your time` : ""}`
          : browserZone
            ? `Your time zone: ${pretty(browserZone)}`
            : null}
      </p>
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
