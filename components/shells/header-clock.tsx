"use client";

import { usePathname } from "next/navigation";
import { Countdown } from "@/components/ui/countdown";

/**
 * Time left, in the player header. Hidden on the hunt home, whose dashboard
 * already shows the finish countdown front and centre.
 */
export function HeaderClock({ slug, endsAt, serverNow }: { slug: string; endsAt: number; serverNow: number }) {
  const pathname = usePathname();
  if (pathname === `/h/${slug}`) return null;
  return (
    <span className="flex items-baseline gap-1.5 text-ink-2">
      <Countdown to={endsAt} serverNow={serverNow} className="text-xl text-ink" />
      <span className="text-xs font-medium">left</span>
    </span>
  );
}
