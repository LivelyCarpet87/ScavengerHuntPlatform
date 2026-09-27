"use client";

import { useEffect, useEffectEvent } from "react";
import type { HuntEventEnvelope } from "@/lib/realtime/bus";

/**
 * Subscribes to the hunt's live event stream (SSE) for as long as the
 * component is mounted. Reconnects with backoff; the handler always sees the
 * latest props without re-subscribing.
 *
 *   useHuntEvents(huntId, (e) => { if (e.type === "submission.judged") … })
 */
export function useHuntEvents(huntId: string, onEvent: (event: HuntEventEnvelope) => void, enabled = true) {
  const handle = useEffectEvent(onEvent);

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    let source: EventSource | null = null;
    let stopped = false;
    let retryMs = 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      source = new EventSource(`/api/hunts/${huntId}/events`);
      source.addEventListener("hello", () => {
        retryMs = 1000;
      });
      source.addEventListener("hunt", (message) => {
        try {
          handle(JSON.parse((message as MessageEvent<string>).data));
        } catch (err) {
          console.warn("Bad hunt event", err);
        }
      });
      source.onerror = () => {
        source?.close();
        if (stopped) return;
        timer = setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, 30_000);
      };
    };
    connect();

    return () => {
      stopped = true;
      clearTimeout(timer);
      source?.close();
    };
  }, [huntId, enabled]);
}
