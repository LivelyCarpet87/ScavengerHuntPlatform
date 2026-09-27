"use client";

import { useRouter } from "next/navigation";
import { requestRefresh } from "./refresh";
import { useHuntEvents } from "./use-hunt-events";

/**
 * Mounted once by StaffShell: keeps the pending-review badge and the current
 * page fresh as submissions arrive or get judged by other staff. During a
 * steady stream of submissions the page refreshes at least every 3 s; the
 * refresh is shared with the page's own LiveRefresh (see ./refresh.ts).
 * Unlike players' phones, staff tabs stay live in the background: judges
 * watch the queue's count in the tab title.
 */
export function StaffLive({ huntId }: { huntId: string }) {
  const router = useRouter();
  useHuntEvents(
    huntId,
    (e) => {
      if (e.type === "submission.created" || e.type === "submission.judged") {
        requestRefresh(router, "soon", { hidden: true });
      }
    },
    { background: true, onResync: () => requestRefresh(router, "soon", { hidden: true }) },
  );
  return null;
}
