"use client";

import { Unlink2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { Notice } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { takeLeftNote, useFormerTeam } from "./device-team";

/**
 * Top of the hunt page for a device that isn't on a team (any more). When
 * this phone was on one until its captain or an organizer signed it out or
 * took the player off, says so and how to get back — the page would otherwise
 * just turn into the visitor view. After leaving on purpose, confirms it with
 * a toast instead.
 */
export function FormerTeamNotice({ huntId }: { huntId: string }) {
  const former = useFormerTeam(huntId);
  const ref = useRef<HTMLDivElement>(null);
  const shown = former != null;

  useEffect(() => {
    const left = takeLeftNote(huntId);
    if (left) toast({ title: `You left ${left}` });
  }, [huntId]);

  // The page can turn into this one live, wherever the player had scrolled to: bring the notice into view.
  useLayoutEffect(() => {
    const el = ref.current;
    if (shown && el && el.getBoundingClientRect().top < 64) el.scrollIntoView({ block: "start" });
  }, [shown]);

  if (!former) return null;
  return (
    <div ref={ref} className="scroll-mt-20">
      <Notice
        tone="warning"
        icon={<Unlink2 aria-hidden className="size-4" />}
        title={`This phone isn’t on ${former.teamName} any more`}
      >
        Your captain or an organizer signed it out, or took you off the team. To carry on as {former.playerName}, ask a
        teammate to share the team’s invite link and open it on this phone.
      </Notice>
    </div>
  );
}
