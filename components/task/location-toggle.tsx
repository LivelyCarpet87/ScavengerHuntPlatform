"use client";

import { type Ref, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Switch } from "@/components/ui/field";

export type Coords = { lat: number; lng: number; accuracy: number };

/** A fix older than this is taken again before it's attached to a submission. */
const FRESH_MS = 60_000;

type Fix = Coords & { at: number };

type Status = { kind: "off" } | { kind: "locating" } | { kind: "on"; fix: Fix } | { kind: "error"; message: string };

export type LocationHandle = {
  /**
   * The position to attach to a submission now: null when the switch is off,
   * otherwise a fix at most a minute old (taking a new one if needed; null if
   * that fails, and the switch says why).
   */
  current(): Promise<Coords | null>;
};

/**
 * "Add my location" — attaches the phone's position to a submission so judges
 * can see where it was taken. Asks for location only when switched on, and
 * stays on for the next submission (contest teams send several), taking a
 * fresh fix each time rather than reusing where the first one was sent from.
 */
export function LocationToggle({ disabled, ref }: { disabled?: boolean; ref?: Ref<LocationHandle> }) {
  const [status, setStatus] = useState<Status>({ kind: "off" });
  const request = useRef(0);

  // Ignore a position that arrives after the form is gone.
  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );

  /** Takes a fix and shows it; resolves with it, or null when there's none. */
  const locate = useCallback((): Promise<Fix | null> => {
    if (!("geolocation" in navigator)) {
      setStatus({ kind: "error", message: "This browser can’t share your location." });
      return Promise.resolve(null);
    }
    const id = ++request.current;
    setStatus({ kind: "locating" });
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (id !== request.current) return resolve(null);
          const fix = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
            at: Date.now(),
          };
          setStatus({ kind: "on", fix });
          resolve(fix);
        },
        (err) => {
          if (id !== request.current) return resolve(null);
          setStatus({
            kind: "error",
            message:
              err.code === err.PERMISSION_DENIED
                ? "Location is blocked for this site. Allow it in your browser settings to add it."
                : "Couldn’t get a location fix. Try again in the open, away from tall buildings.",
          });
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
      );
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      async current() {
        if (status.kind === "on" && Date.now() - status.fix.at < FRESH_MS) return strip(status.fix);
        if (status.kind !== "on" && status.kind !== "locating") return null;
        const fix = await locate();
        return fix ? strip(fix) : null;
      },
    }),
    [status, locate],
  );

  function turnOff() {
    request.current += 1;
    setStatus({ kind: "off" });
  }

  const checked = status.kind === "on" || status.kind === "locating";
  const hint =
    status.kind === "locating"
      ? "Finding you…"
      : status.kind === "on"
        ? `Added, accurate to about ${status.fix.accuracy} m.`
        : status.kind === "error"
          ? status.message
          : "Helps the judges see where you were.";

  return (
    <div>
      <Switch
        label="Add my location"
        hint={
          <span aria-live="polite" className={status.kind === "error" ? "text-danger" : undefined}>
            {hint}
          </span>
        }
        checked={checked}
        disabled={disabled}
        onChange={(e) => (e.target.checked ? void locate() : turnOff())}
      />
    </div>
  );
}

function strip({ lat, lng, accuracy }: Fix): Coords {
  return { lat, lng, accuracy };
}
