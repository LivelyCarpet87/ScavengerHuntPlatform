"use client";

import { useCallback, useSyncExternalStore } from "react";

/*
 * Whether the judging queue's single-key shortcuts (A, R, S, J, K, F, P, U,
 * 1–9, ?) are on. A judge can turn them off (WCAG 2.1.4): speech input and
 * stray key presses can otherwise approve or reject by accident. Arrow keys
 * and Ctrl/⌘ combinations keep working either way. Remembered per browser.
 */

const KEY = "shp:judge-single-keys";
const listeners = new Set<() => void>();
/** The choice made on this page (it outlasts a failed write, e.g. private mode, until the page reloads). */
let memory: boolean | null = null;

function read(): boolean {
  if (memory != null) return memory;
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    memory = null; // Another tab changed it.
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSingleKeys(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => true);
  const set = useCallback((next: boolean) => {
    memory = next;
    try {
      if (next) window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, "off");
    } catch {
      // Remembered for this page only.
    }
    for (const l of listeners) l();
  }, []);
  return [on, set];
}
