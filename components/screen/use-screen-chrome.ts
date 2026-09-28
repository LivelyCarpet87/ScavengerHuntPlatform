"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/*
 * Behaviour of a browser tab driving a projector: no sleeping, no cursor,
 * one button to go full screen. (Night-O and the projector type scale are
 * set by <ScreenDocument> in the screen's layout.)
 */

/** Keeps the display awake; re-acquires the lock whenever the tab becomes visible again. */
export function useWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) void next.release();
        else lock = next;
      } catch {
        // Denied (battery saver, unsupported context): the screen may sleep.
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      if (lock && !lock.released) void lock.release();
    };
  }, []);
}

/**
 * True while the pointer or keyboard was used in the last `ms` milliseconds.
 * Starts idle: a projector nobody touches never shows a cursor or controls.
 */
export function useActivity(ms = 3000): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poke = () => {
      setActive(true);
      clearTimeout(timer);
      timer = setTimeout(() => setActive(false), ms);
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, poke, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, poke);
    };
  }, [ms]);
  return active;
}

function subscribeFullscreen(cb: () => void) {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
}

/** Fullscreen state plus a toggle (no-op where the API is missing, e.g. iPhone Safari). */
export function useFullscreen() {
  const isFullscreen = useSyncExternalStore(
    subscribeFullscreen,
    () => !!document.fullscreenElement,
    () => false,
  );
  const supported = useSyncExternalStore(
    () => () => {},
    () => typeof document.documentElement.requestFullscreen === "function",
    () => false,
  );
  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    } catch {
      // The browser refused (e.g. not triggered by a user gesture).
    }
  }, []);
  return { isFullscreen, supported, toggle };
}
