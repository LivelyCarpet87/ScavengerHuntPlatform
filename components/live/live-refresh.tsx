"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { HuntEventType } from "@/lib/realtime/bus";
import { useHuntEvents } from "./use-hunt-events";

/**
 * Drop into any server-rendered hunt page to keep it live: re-renders the
 * route (router.refresh) when matching events arrive, and when the tab comes
 * back into view after being hidden (phones drop connections when locked).
 *
 *   <LiveRefresh huntId={hunt.id} on={["submission.judged", "scores.changed"]} />
 */
export function LiveRefresh({
  huntId,
  on,
  debounceMs = 600,
}: {
  huntId: string;
  /** Event types that trigger a refresh. Omit for all. */
  on?: HuntEventType[];
  debounceMs?: number;
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hiddenAt = useRef<number | null>(null);

  const schedule = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), debounceMs);
  };

  useHuntEvents(huntId, (event) => {
    if (!on || on.includes(event.type)) schedule();
  });

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current && Date.now() - hiddenAt.current > 15_000) {
        hiddenAt.current = null;
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(timer.current);
    };
  }, [router]);

  return null;
}
