"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { DateTimeField } from "@/components/ui/datetime-field";
import { Select } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form";
import { formLevel } from "@/lib/staff/forms";
import { updateScheduleAction } from "@/lib/staff/hunt-actions";
import { useActionForm } from "../use-action-form";

/**
 * Start, end and scoreboard freeze, entered in the organizer's local time,
 * plus the time zone the hunt prints its times in (posters, notifications).
 */
export function ScheduleForm({
  huntId,
  values,
}: {
  huntId: string;
  values: { startsAt: string | null; endsAt: string | null; freezeAt: string | null; timezone: string };
}) {
  const ids = useId();
  const { state, pending, onSubmit, formRef } = useActionForm(updateScheduleAction);
  // The full zone list and the browser's own zone are only known in the browser: fill them in after mount.
  const [zones, setZones] = useState<string[]>([values.timezone]);
  const [browserZone, setBrowserZone] = useState<string | null>(null);
  const [zone, setZone] = useState(values.timezone);
  useEffect(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    setZones([...new Set([values.timezone, ...all])].sort((a, b) => a.localeCompare(b)));
    setBrowserZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
  }, [values.timezone]);
  const zoneError = fieldError(state, "timezone");
  const pretty = (z: string) => z.replace(/_/g, " ");

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-5">
      <input type="hidden" name="huntId" value={huntId} />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <DateTimeField
          name="startsAt"
          label="Starts"
          hint="Tasks appear to players at this moment."
          defaultValue={values.startsAt}
          error={fieldError(state, "startsAt")}
        />
        <DateTimeField
          name="endsAt"
          label="Ends"
          hint="Submissions close; final results show."
          defaultValue={values.endsAt}
          error={fieldError(state, "endsAt")}
        />
      </div>
      <DateTimeField
        name="freezeAt"
        label="Freeze the scoreboard at"
        hint="Optional. From this moment players and the big screen see the standings as they were, while you keep seeing live scores. The final result is revealed when the hunt ends."
        defaultValue={values.freezeAt}
        error={fieldError(state, "freezeAt")}
        className="sm:max-w-[calc(50%-0.625rem)]"
      />
      <div className="flex flex-col gap-1.5 sm:max-w-[calc(50%-0.625rem)]">
        <label htmlFor={`${ids}-zone`} className="text-sm font-semibold">
          Hunt time zone
        </label>
        <p id={`${ids}-zone-hint`} className="-mt-1 text-sm text-ink-2">
          Printed posters, notifications and the big screen show times in this zone.
        </p>
        <Select
          id={`${ids}-zone`}
          name="timezone"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          aria-describedby={`${ids}-zone-hint`}
          aria-invalid={zoneError ? true : undefined}
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {pretty(z)}
            </option>
          ))}
        </Select>
        {browserZone && browserZone !== zone && zones.includes(browserZone) ? (
          <Button variant="quiet" size="sm" className="self-start" onClick={() => setZone(browserZone)}>
            Use my time zone ({pretty(browserZone)})
          </Button>
        ) : null}
        {zoneError ? <p className="text-sm font-medium text-danger">{zoneError}</p> : null}
      </div>
      <FormMessage state={formLevel(state, ["startsAt", "endsAt", "freezeAt", "timezone"])} />
      <Button type="submit" variant="secondary" pending={pending} className="self-start">
        Save schedule
      </Button>
    </form>
  );
}
