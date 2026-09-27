"use client";

import { useSyncExternalStore } from "react";

/**
 * A shared 1-second clock for countdowns and relative times. One interval for
 * the whole page, no matter how many components subscribe.
 */

let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Current time in ms, updated every second. `serverNow` keeps SSR and hydration in agreement. */
export function useNow(serverNow: number): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => serverNow,
  );
}
