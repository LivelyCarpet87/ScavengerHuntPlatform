"use client";

import { formatClock, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNow } from "./clock";

/**
 * Live countdown to `to` (ISO string or ms). Shows "1:23:45"; once passed,
 * shows `doneLabel`. Pass `serverNow` from the server render to avoid a
 * hydration flash.
 */
export function Countdown({
  to,
  serverNow,
  doneLabel = "0:00",
  className,
}: {
  to: string | number;
  serverNow: number;
  doneLabel?: string;
  className?: string;
}) {
  const now = useNow(serverNow);
  const target = typeof to === "number" ? to : new Date(to).getTime();
  const left = target - now;
  return (
    <time
      dateTime={new Date(target).toISOString()}
      className={cn("font-bib tabular-nums", className)}
      suppressHydrationWarning
    >
      {left > 0 ? formatClock(left) : doneLabel}
    </time>
  );
}

/** "3 min ago" that stays fresh. */
export function RelativeTime({
  at,
  serverNow,
  className,
}: {
  at: string | number;
  serverNow: number;
  className?: string;
}) {
  const now = useNow(serverNow);
  const t = typeof at === "number" ? at : new Date(at).getTime();
  return (
    <time dateTime={new Date(t).toISOString()} className={className} suppressHydrationWarning>
      {formatRelative(t, now)}
    </time>
  );
}
