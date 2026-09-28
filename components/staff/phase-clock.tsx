"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useNow } from "@/components/ui/clock";
import { formatClock, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Time to the next phase change: "2 d 3 h" when it's far off, a ticking
 * "1:23:45" inside a day. Refreshes the page when the moment passes, so the
 * overview flips from "upcoming" to "live" (or "live" to "finished") on its own.
 */
export function PhaseClock({
  target,
  serverNow,
  doneLabel,
  className,
}: {
  target: number;
  serverNow: number;
  doneLabel: string;
  className?: string;
}) {
  const now = useNow(serverNow);
  const router = useRouter();
  const refreshed = useRef(false);
  const left = target - now;

  useEffect(() => {
    if (left <= 0 && target > serverNow && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [left, target, serverNow, router]);

  return (
    <time
      dateTime={new Date(target).toISOString()}
      suppressHydrationWarning
      className={cn("font-bib tabular-nums leading-none", className)}
    >
      {left <= 0 ? doneLabel : left > 86_400_000 ? formatDuration(left) : formatClock(left)}
    </time>
  );
}
