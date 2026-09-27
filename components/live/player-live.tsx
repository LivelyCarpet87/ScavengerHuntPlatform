"use client";

import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { formatSigned } from "@/lib/format";
import { useHuntEvents } from "./use-hunt-events";

/**
 * Mounted once by PlayerShell for players who joined a team: tells them the
 * moment a judge decides on their submission, and refreshes the page.
 */
export function PlayerLive({ huntId, teamId }: { huntId: string; teamId: string }) {
  const router = useRouter();
  useHuntEvents(huntId, (e) => {
    if (e.type === "submission.judged" && e.teamId === teamId) {
      const what = e.taskTitle ?? "your submission";
      if (e.status === "approved") {
        toast({
          title: `Accepted: ${what}`,
          description: e.points ? `${formatSigned(e.points)} points` : undefined,
          tone: "success",
        });
        navigator.vibrate?.([30, 40, 30]);
      } else if (e.status === "rejected") {
        toast({
          title: `Not accepted: ${what}`,
          description: e.feedback ?? "Open the task to see why.",
          tone: "danger",
        });
      }
      router.refresh();
    } else if (e.type === "announcement.created") {
      toast({ title: e.title || "New announcement", description: e.body, tone: "accent", durationMs: 8000 });
      router.refresh();
    } else if (e.type === "tasks.changed" || e.type === "hunt.changed") {
      router.refresh();
    }
  });
  return null;
}
