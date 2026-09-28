"use client";

import { useEffect, useSyncExternalStore } from "react";

/*
 * Android and desktop Chromium fire `beforeinstallprompt` once, early in the
 * page load — often before any "Install" button has mounted. The service
 * worker registrar (in the root layout) calls captureInstallPrompt() so the
 * event is kept for whichever InstallPrompt renders later.
 */

export type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallState = { event: BeforeInstallPromptEvent | null; installed: boolean };

let state: InstallState = { event: null, installed: false };
let listening = false;
const listeners = new Set<() => void>();

function set(next: Partial<InstallState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function captureInstallPrompt(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    // Keep the browser's own mini-infobar away; we offer an "Install the app" button instead.
    e.preventDefault();
    set({ event: e as BeforeInstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => set({ event: null, installed: true }));
}

/** Shows the browser's install dialog. Returns true when the person accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = state.event;
  if (!e) return false;
  // The event can only be used once.
  set({ event: null });
  await e.prompt();
  const choice = await e.userChoice;
  if (choice.outcome === "accepted") set({ installed: true });
  return choice.outcome === "accepted";
}

const EMPTY: InstallState = { event: null, installed: false };

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => EMPTY,
  );
}

// iOS Home Screen steps ------------------------------------------------------------
// PushToggle shows the steps when notifications need the installed app; an
// InstallPrompt on the same page then stays out of the way instead of repeating them.

let stepsClaims = 0;
const stepsListeners = new Set<() => void>();
const emitSteps = () => {
  for (const l of stepsListeners) l();
};

/** Marks the iOS install steps as shown by this component while `active`. */
export function useClaimIosSteps(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    stepsClaims += 1;
    emitSteps();
    return () => {
      stepsClaims -= 1;
      emitSteps();
    };
  }, [active]);
}

/** Whether another component on the page is already showing the iOS install steps. */
export function useIosStepsClaimed(): boolean {
  return useSyncExternalStore(
    (cb) => {
      stepsListeners.add(cb);
      return () => stepsListeners.delete(cb);
    },
    () => stepsClaims > 0,
    () => false,
  );
}
