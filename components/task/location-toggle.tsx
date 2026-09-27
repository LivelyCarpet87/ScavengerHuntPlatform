"use client";

import { useEffect, useRef, useState } from "react";
import { Switch } from "@/components/ui/field";

export type Coords = { lat: number; lng: number; accuracy: number };

type Status =
  | { kind: "off" }
  | { kind: "locating" }
  | { kind: "on"; coords: Coords }
  | { kind: "error"; message: string };

/**
 * "Add my location" — attaches the phone's position to a submission so judges
 * can see where it was taken. Asks for location only when switched on.
 */
export function LocationToggle({
  onChange,
  disabled,
}: {
  onChange: (coords: Coords | null) => void;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<Status>({ kind: "off" });
  const request = useRef(0);

  // Ignore a position that arrives after the form is gone.
  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );

  function turnOn() {
    if (!("geolocation" in navigator)) {
      setStatus({ kind: "error", message: "This browser can't share your location." });
      return;
    }
    const id = ++request.current;
    setStatus({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (id !== request.current) return;
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        };
        setStatus({ kind: "on", coords });
        onChange(coords);
      },
      (err) => {
        if (id !== request.current) return;
        setStatus({
          kind: "error",
          message:
            err.code === err.PERMISSION_DENIED
              ? "Location is blocked for this site. Allow it in your browser settings to add it."
              : "Couldn't get a location fix. Try again in the open, away from tall buildings.",
        });
        onChange(null);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }

  function turnOff() {
    request.current += 1;
    setStatus({ kind: "off" });
    onChange(null);
  }

  const checked = status.kind === "on" || status.kind === "locating";
  const hint =
    status.kind === "locating"
      ? "Finding you…"
      : status.kind === "on"
        ? `Added, accurate to about ${status.coords.accuracy} m.`
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
        onChange={(e) => (e.target.checked ? turnOn() : turnOff())}
      />
    </div>
  );
}
