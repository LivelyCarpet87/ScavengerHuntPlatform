"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Date & time picker in the organizer's local time. Submits `name` as an ISO
 * UTC string (or "" when cleared), so the server never guesses time zones.
 * Parse on the server with `zOptionalDate` from lib/actions.
 */
export function DateTimeField({
  name,
  label,
  hint,
  defaultValue,
  error,
  className,
  required,
}: {
  name: string;
  label: string;
  hint?: string;
  /** ISO string */
  defaultValue?: string | null;
  error?: string | null;
  className?: string;
  required?: boolean;
}) {
  const id = useId();
  const [local, setLocal] = useState("");
  const [zone, setZone] = useState("");
  // Local time is only known in the browser; fill after mount.
  useEffect(() => setLocal(toLocalInput(defaultValue)), [defaultValue]);
  // So is the zone: computed during render, the hint showed the server's zone (hydration keeps server text).
  useEffect(() => setZone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  const iso = local ? new Date(local).toISOString() : "";

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {hint ? <p className="-mt-1 text-sm text-ink-2">{hint}</p> : null}
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="datetime-local"
          value={local}
          required={required}
          onChange={(e) => setLocal(e.target.value)}
          aria-invalid={error ? true : undefined}
          className="h-12 w-full rounded-md bg-mist px-3.5 text-base text-ink hover:bg-mist-2 focus:bg-paper focus:shadow-[inset_0_0_0_2px_var(--ink)] focus:outline-none aria-invalid:shadow-[inset_0_0_0_2px_var(--danger)]"
        />
        {local ? (
          <button
            type="button"
            onClick={() => setLocal("")}
            className="h-12 shrink-0 rounded-md px-3 text-sm font-semibold text-ink-2 hover:bg-mist hover:text-ink"
          >
            Clear
          </button>
        ) : null}
      </div>
      <input type="hidden" name={name} value={iso} />
      <p className="text-xs text-ink-3" suppressHydrationWarning>
        {zone ? `Your time zone: ${zone}` : null}
      </p>
      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}
