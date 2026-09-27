"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useHuntEvents } from "./use-hunt-events";

/**
 * Mounted once by StaffShell: keeps the pending-review badge and the current
 * page fresh as submissions arrive or get judged by other staff.
 */
export function StaffLive({ huntId }: { huntId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useHuntEvents(huntId, (e) => {
    if (e.type === "submission.created" || e.type === "submission.judged") {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 800);
    }
  });
  return null;
}
