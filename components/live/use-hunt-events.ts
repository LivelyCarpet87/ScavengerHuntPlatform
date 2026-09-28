"use client";

import { useEffect, useEffectEvent } from "react";
import type { HuntEventEnvelope } from "@/lib/realtime/bus";

/*
 * One live connection per hunt per tab. Every useHuntEvents() on the page —
 * PlayerLive or StaffLive in the shell, the page's LiveRefresh, the big
 * screen — shares it, so a tab holds a single /events stream (browsers allow
 * only six HTTP/1.1 connections per host) and moving between pages keeps it.
 *
 * Nothing is lost while it is down. After a drop (no signal, a switch between
 * Wi-Fi and mobile data, a locked phone) it reconnects with the last event it
 * saw, and the server replays what this viewer missed; when it can't (the
 * server restarted, or the tab was away too long) subscribers get `onResync`
 * and reload what they show. It reconnects at once when the browser comes
 * back online or the tab comes back into view, notices a connection that
 * went silent, and lets go of it while the tab stays hidden (unless a
 * subscriber asked for `background` updates).
 */

export type Subscriber = {
  onEvent: (event: HuntEventEnvelope) => void;
  onResync?: () => void;
  viewer?: string;
  /** Keep the connection while the tab is hidden. */
  background?: boolean;
};

type Timer = ReturnType<typeof setTimeout>;

type Stream = {
  huntId: string;
  subscribers: Set<Subscriber>;
  source: EventSource | null;
  /** Who the current connection was opened for (see the `viewer` option). */
  viewer: string | undefined;
  /** The last event this tab has seen, and the server run it came from: where a reconnect resumes. */
  lastSeq: number | null;
  boot: string | null;
  retryMs: number;
  /** Closed on purpose while the tab is hidden; reopens when it's visible again. */
  asleep: boolean;
  retry?: Timer;
  settle?: Timer;
  linger?: Timer;
  sleep?: Timer;
  watchdog?: Timer;
};

const MIN_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;
/** Keep the stream this long after its last subscriber leaves, so the next page reuses it. */
const LINGER_MS = 3000;
/** Let go of the connection once the tab has been hidden this long. */
const HIDDEN_CLOSE_MS = 30_000;
/** The server pings every 20 s; this much silence means the connection died without telling us. */
const SILENCE_MS = 50_000;

const streams = new Map<string, Stream>();

/** Hidden, and nobody on this stream needs updates in the background. */
function idle(s: Stream) {
  if (document.visibilityState !== "hidden") return false;
  for (const sub of s.subscribers) if (sub.background) return false;
  return true;
}

function parse<T>(data: string): T | null {
  try {
    return JSON.parse(data) as T;
  } catch (err) {
    console.warn("Bad hunt event", err);
    return null;
  }
}

function each(s: Stream, fn: (sub: Subscriber) => void) {
  for (const sub of [...s.subscribers]) {
    try {
      fn(sub);
    } catch (err) {
      console.error("[live] handler failed", err);
    }
  }
}

function alive(s: Stream) {
  clearTimeout(s.watchdog);
  s.watchdog = setTimeout(() => drop(s), SILENCE_MS);
}

function connect(s: Stream) {
  clearTimeout(s.retry);
  s.retry = undefined;
  s.source?.close();
  s.asleep = false;
  const resume = s.lastSeq != null && s.boot ? `?since=${s.lastSeq}&boot=${encodeURIComponent(s.boot)}` : "";
  const source = new EventSource(`/api/hunts/${s.huntId}/events${resume}`);
  s.source = source;
  alive(s);
  if (idle(s)) sleepSoon(s);

  source.addEventListener("hello", (message) => {
    if (s.source !== source) return;
    alive(s);
    s.retryMs = MIN_RETRY_MS;
    // Sent after any replay: everything up to `seq` has arrived or didn't concern this viewer.
    const hello = parse<{ boot?: string; seq?: number }>((message as MessageEvent<string>).data);
    if (hello?.boot && typeof hello.seq === "number") {
      s.boot = hello.boot;
      s.lastSeq = hello.seq;
    }
  });
  source.addEventListener("ping", () => {
    if (s.source === source) alive(s);
  });
  source.addEventListener("hunt", (message) => {
    if (s.source !== source) return;
    alive(s);
    const event = parse<HuntEventEnvelope>((message as MessageEvent<string>).data);
    if (!event) return;
    if (typeof event.seq === "number") s.lastSeq = Math.max(s.lastSeq ?? 0, event.seq);
    each(s, (sub) => sub.onEvent(event));
  });
  // The server couldn't replay what was missed: what the page shows may be out of date.
  source.addEventListener("resync", () => {
    if (s.source === source) each(s, (sub) => sub.onResync?.());
  });
  source.onerror = () => {
    if (s.source === source) drop(s);
  };
}

/** The connection failed or went silent: try again with backoff, or once the tab is visible. */
function drop(s: Stream) {
  clearTimeout(s.watchdog);
  s.source?.close();
  s.source = null;
  if (idle(s)) {
    s.asleep = true;
    return;
  }
  clearTimeout(s.retry);
  s.retry = setTimeout(() => connect(s), s.retryMs);
  s.retryMs = Math.min(s.retryMs * 2, MAX_RETRY_MS);
}

function sleepSoon(s: Stream) {
  clearTimeout(s.sleep);
  s.sleep = setTimeout(() => {
    if (!idle(s)) return;
    clearTimeout(s.retry);
    clearTimeout(s.watchdog);
    s.retry = undefined;
    s.source?.close();
    s.source = null;
    s.asleep = true;
  }, HIDDEN_CLOSE_MS);
}

/** Reconnect right away when the stream is down (backing off, or asleep). */
function wake(s: Stream) {
  clearTimeout(s.sleep);
  if (s.source || s.subscribers.size === 0) return;
  s.retryMs = MIN_RETRY_MS;
  connect(s);
}

function onVisibility() {
  for (const s of streams.values()) {
    if (idle(s)) sleepSoon(s);
    else if (document.visibilityState === "visible") wake(s);
  }
}

function onOnline() {
  for (const s of streams.values()) wake(s);
}

function close(s: Stream) {
  for (const t of [s.retry, s.settle, s.linger, s.sleep, s.watchdog]) clearTimeout(t);
  s.source?.close();
  s.source = null;
  streams.delete(s.huntId);
  if (streams.size === 0) {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("online", onOnline);
  }
}

/**
 * Runs once the components of a commit have (un)subscribed: opens the
 * connection; reopens it when the viewer it was opened for changed (the
 * player joined, left or switched teams — the server decides whose events a
 * stream carries when it connects); lets it go when nobody listens any more.
 */
function reconcile(s: Stream) {
  s.settle = undefined;
  if (s.subscribers.size === 0) {
    clearTimeout(s.linger);
    s.linger = setTimeout(() => {
      if (s.subscribers.size === 0) close(s);
    }, LINGER_MS);
    return;
  }
  let viewer: string | undefined;
  for (const sub of s.subscribers) viewer = sub.viewer ?? viewer;
  if (viewer !== s.viewer) {
    s.viewer = viewer;
    // The page re-rendered for someone else; what the old connection saw doesn't carry over.
    s.lastSeq = null;
    s.boot = null;
    s.retryMs = MIN_RETRY_MS;
    connect(s);
  } else if (!s.source && !s.retry && (!s.asleep || !idle(s))) {
    // Not connected yet, or asleep in a hidden tab that now has a background subscriber.
    connect(s);
  }
}

/** The shared connection behind useHuntEvents (exported for tests). */
export function subscribe(huntId: string, sub: Subscriber): () => void {
  let s = streams.get(huntId);
  if (!s) {
    if (streams.size === 0) {
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("online", onOnline);
    }
    s = {
      huntId,
      subscribers: new Set(),
      source: null,
      viewer: undefined,
      lastSeq: null,
      boot: null,
      retryMs: MIN_RETRY_MS,
      asleep: false,
    };
    streams.set(huntId, s);
  }
  const stream = s;
  clearTimeout(stream.linger);
  stream.subscribers.add(sub);
  // Everyone mounting in this commit subscribes first; then one connection opens for all of them.
  stream.settle ??= setTimeout(() => reconcile(stream), 0);
  return () => {
    stream.subscribers.delete(sub);
    stream.settle ??= setTimeout(() => reconcile(stream), 0);
  };
}

/**
 * Subscribes to the hunt's live events for as long as the component is
 * mounted. The handler always sees the latest props without re-subscribing.
 *
 *   useHuntEvents(huntId, (e) => { if (e.type === "submission.judged") … })
 *
 * - `onResync`: events were missed and couldn't be replayed; reload what the
 *   component shows (e.g. router.refresh()).
 * - `viewer`: who the page is rendered for (e.g. `team:<id>`), when the
 *   component knows. The shared connection reopens when it changes.
 * - `background`: keep receiving events while the tab is hidden.
 * - `enabled`: false to not listen.
 */
export function useHuntEvents(
  huntId: string,
  onEvent: (event: HuntEventEnvelope) => void,
  {
    onResync,
    viewer,
    background = false,
    enabled = true,
  }: { onResync?: () => void; viewer?: string; background?: boolean; enabled?: boolean } = {},
) {
  const handle = useEffectEvent(onEvent);
  const resync = useEffectEvent(() => onResync?.());

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    return subscribe(huntId, { onEvent: (e) => handle(e), onResync: () => resync(), viewer, background });
  }, [huntId, enabled, viewer, background]);
}
