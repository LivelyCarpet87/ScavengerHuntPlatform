"use client";

import { createContext, type ReactNode, startTransition, useContext, useEffect, useRef, useState } from "react";
import { markUpdatesSeen } from "@/lib/player/actions";

/*
 * Unread handling for the Updates tab. Opening the tab marks everything as
 * seen (which clears the tab badge), but items that were new when the page
 * opened keep their "New" mark for as long as the page stays open.
 */

const SinceContext = createContext<number>(Number.POSITIVE_INFINITY);

export function UpdatesSeen({
  huntId,
  since,
  newest,
  children,
}: {
  huntId: string;
  /** The player's last visit (ms): items after it are new. */
  since: number;
  /** Timestamp of the newest item on the page (ms), or 0. */
  newest: number;
  children: ReactNode;
}) {
  // Keep the first value: marking as seen re-renders the page with a later `since`.
  const [frozenSince] = useState(since);
  const marked = useRef(since);

  useEffect(() => {
    const mark = () => {
      if (document.visibilityState !== "visible" || newest <= marked.current) return;
      const before = marked.current;
      marked.current = newest;
      startTransition(async () => {
        try {
          await markUpdatesSeen(huntId);
        } catch {
          // Offline or the server is busy: the badge stays, and the next visit tries again.
          marked.current = before;
        }
      });
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [huntId, newest]);

  return <SinceContext value={frozenSince}>{children}</SinceContext>;
}

/** "New" marker for a feed item that arrived since the player's last visit. */
export function NewMark({ at }: { at: number }) {
  const since = useContext(SinceContext);
  if (at <= since) return null;
  return (
    <>
      <span aria-hidden className="absolute top-4 bottom-4 -left-3 w-1 rounded-full bg-accent sm:-left-4" />
      <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-ink">
        New
      </span>
    </>
  );
}
