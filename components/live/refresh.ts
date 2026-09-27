"use client";

import type { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { HuntEventEnvelope } from "@/lib/realtime/bus";
import { createPacer, type Pace } from "./pacer";

type Router = ReturnType<typeof useRouter>;

/*
 * One router.refresh() per tab for everything live on the page.
 *
 * router.refresh() re-renders the whole route, so when PlayerLive (or
 * StaffLive) in the shell and the page's LiveRefresh react to the same event
 * — or to a burst of them — one server render serves them all. Other teams'
 * activity refreshes at most every 15 s (plus jitter, so a big event's phones
 * don't hit the server together), and a hidden tab refreshes only once it is
 * looked at again.
 */

const AWAY_MS = 15_000;

let router: Router | null = null;
let hiddenAt: number | null = null;
let awayWatchers = 0;
let listening = false;

const pacer = createPacer(() => router?.refresh(), {
  quietMs: 600,
  maxWaitMs: 3000,
  gapMs: 15_000,
  jitterMs: 5000,
});

function listen() {
  if (listening) return;
  listening = true;
  if (document.visibilityState === "hidden") hiddenAt = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      pacer.hide();
      return;
    }
    const away = hiddenAt != null && Date.now() - hiddenAt > AWAY_MS;
    hiddenAt = null;
    // Phones drop connections when locked: after a while away, refresh pages that asked for it.
    pacer.show(away && awayWatchers > 0);
  });
}

/**
 * Ask for the current route to be re-rendered; merged with every other
 * request in the tab. `hidden: true` also refreshes a tab in the background.
 */
export function requestRefresh(r: Router, pace: Pace = "soon", opts?: { hidden?: boolean }): void {
  router = r;
  listen();
  pacer.ask(pace, opts);
}

/** How soon an event should refresh a page: other teams' activity can wait. */
export function paceFor(event: HuntEventEnvelope): Pace {
  return (event.type === "scores.changed" || event.type === "teams.changed") && event.mine === false ? "later" : "soon";
}

/** Also refresh when the tab comes back into view after more than 15 s away. */
export function useRefreshWhenBack(r: Router): void {
  useEffect(() => {
    router = r;
    listen();
    awayWatchers += 1;
    return () => {
      awayWatchers -= 1;
    };
  }, [r]);
}
