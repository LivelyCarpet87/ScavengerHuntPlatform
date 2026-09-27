"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useHuntEvents } from "./use-hunt-events";

const QUIET_MS = 800;
/** During a steady stream of submissions, refresh at least this often. */
const MAX_WAIT_MS = 3000;

/**
 * Mounted once by StaffShell: keeps the pending-review badge and the current
 * page fresh as submissions arrive or get judged by other staff.
 */
export function StaffLive({ huntId }: { huntId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const firstPending = useRef<number | null>(null);

  useHuntEvents(huntId, (e) => {
    if (e.type !== "submission.created" && e.type !== "submission.judged") return;
    const now = Date.now();
    firstPending.current ??= now;
    const waited = now - firstPending.current;
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => {
        firstPending.current = null;
        router.refresh();
      },
      Math.max(0, Math.min(QUIET_MS, MAX_WAIT_MS - waited)),
    );
  });
  return null;
}
