"use client";

import { useRouter } from "next/navigation";
import type { HuntEventType } from "@/lib/realtime/bus";
import { paceFor, requestRefresh, useRefreshWhenBack } from "./refresh";
import { useHuntEvents } from "./use-hunt-events";

/**
 * Drop into any server-rendered hunt page to keep it live: re-renders the
 * route (router.refresh) when matching events arrive, and when the tab comes
 * back into view after being hidden (phones drop connections when locked).
 *
 *   <LiveRefresh huntId={hunt.id} on={["submission.judged", "scores.changed"]} />
 *
 * Refreshes are shared by the whole tab (see ./refresh.ts): what concerns the
 * viewer's own team or the whole hunt re-renders within a second; other
 * teams' score and team changes at most every 15 s; hidden tabs wait until
 * they are looked at.
 */
export function LiveRefresh({
  huntId,
  on,
}: {
  huntId: string;
  /** Event types that trigger a refresh. Omit for all. */
  on?: HuntEventType[];
}) {
  const router = useRouter();
  useRefreshWhenBack(router);
  useHuntEvents(
    huntId,
    (event) => {
      if (!on || on.includes(event.type)) requestRefresh(router, paceFor(event));
    },
    { onResync: () => requestRefresh(router) },
  );
  return null;
}
