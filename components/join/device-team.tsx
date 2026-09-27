"use client";

import { useEffect, useSyncExternalStore } from "react";

/*
 * What this device remembers about its own team in a hunt, so the hunt page
 * can say what happened once the phone is no longer on it — a captain or an
 * organizer signed it out or took the player off the team — instead of
 * silently turning into the visitor page. Leaving on purpose clears it and
 * leaves a short note for a "You left …" toast instead.
 *
 * Per device, like the session itself (localStorage), and it only ever holds
 * what the device already showed its player. Storage can be unavailable
 * (private mode, blocked): then the page simply has nothing to explain.
 */

export type DeviceTeam = { teamName: string; playerName: string };

const teamKey = (huntId: string) => `shp:team:${huntId}`;
const leftKey = (huntId: string) => `shp:left:${huntId}`;
/** How long after leaving the "You left …" toast may still show (the redirect takes a moment). */
const LEFT_NOTE_MS = 60_000;

const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

function read(storage: "local" | "session", key: string): string | null {
  try {
    return (storage === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function write(storage: "local" | "session", key: string, value: string | null) {
  try {
    const s = storage === "local" ? window.localStorage : window.sessionStorage;
    if (value == null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    // Storage unavailable: nothing to remember.
  }
}

function parseTeam(raw: string | null): DeviceTeam | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<DeviceTeam>;
    return typeof v.teamName === "string" && typeof v.playerName === "string"
      ? { teamName: v.teamName, playerName: v.playerName }
      : null;
  } catch {
    return null;
  }
}

/** Remembers the team this device plays for in a hunt (mounted on the player's own pages). */
export function RememberTeam({ huntId, teamName, playerName }: { huntId: string } & DeviceTeam) {
  useEffect(() => {
    const value = JSON.stringify({ teamName, playerName } satisfies DeviceTeam);
    if (read("local", teamKey(huntId)) !== value) write("local", teamKey(huntId), value);
    // Still on a team: an old "you left" note no longer applies.
    write("session", leftKey(huntId), null);
    emit();
  }, [huntId, teamName, playerName]);
  return null;
}

/** Call as the player leaves their team on purpose: no "signed out" notice, a "You left …" toast instead. */
export function noteLeftTeam(huntId: string, teamName: string) {
  const previous = read("local", teamKey(huntId));
  write("local", teamKey(huntId), null);
  write("session", leftKey(huntId), JSON.stringify({ teamName, at: Date.now(), previous }));
  emit();
}

/** Leaving didn't happen after all (the action failed): remember the team again. */
export function undoLeftTeam(huntId: string) {
  const raw = read("session", leftKey(huntId));
  if (!raw) return;
  write("session", leftKey(huntId), null);
  try {
    const { previous } = JSON.parse(raw) as { previous?: unknown };
    if (typeof previous === "string") write("local", teamKey(huntId), previous);
  } catch {
    // Nothing to restore.
  }
  emit();
}

/** The team this device just left on purpose, once (the note is used up), or null. */
export function takeLeftNote(huntId: string): string | null {
  const raw = read("session", leftKey(huntId));
  if (!raw) return null;
  write("session", leftKey(huntId), null);
  try {
    const v = JSON.parse(raw) as { teamName?: unknown; at?: unknown };
    const fresh = typeof v.at === "number" && Date.now() - v.at < LEFT_NOTE_MS;
    return fresh && typeof v.teamName === "string" ? v.teamName : null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The team this device was on in the hunt, when it isn't any more (use it
 * only where the viewer has no team). Null on the server and until hydrated.
 */
export function useFormerTeam(huntId: string): DeviceTeam | null {
  const raw = useSyncExternalStore(
    subscribe,
    () => read("local", teamKey(huntId)),
    () => null,
  );
  return parseTeam(raw);
}
