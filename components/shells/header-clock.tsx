"use client";

import { usePathname } from "next/navigation";
import { Countdown } from "@/components/ui/countdown";
import { cn } from "@/lib/utils";

/**
 * Time left, in the player header. On the hunt home it shows on phones only:
 * from md up the dashboard's finish panel shows the countdown front and
 * centre, and on phones that panel gives way so the tasks sit higher.
 */
export function HeaderClock({ slug, endsAt, serverNow }: { slug: string; endsAt: number; serverNow: number }) {
  const pathname = usePathname();
  const onHome = pathname === `/h/${slug}`;
  return (
    <span className={cn("flex items-baseline gap-1.5 text-ink-2", onHome && "md:hidden")}>
      <Countdown to={endsAt} serverNow={serverNow} className="text-xl text-ink" />
      <span className="text-xs font-medium">left</span>
    </span>
  );
}
