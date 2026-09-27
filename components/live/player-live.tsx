"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { resultShownInline } from "@/components/task/inline-results";
import { toast } from "@/components/ui/toast";
import { formatSigned } from "@/lib/format";
import { PunchCelebration } from "./punch-celebration";
import { useHuntEvents } from "./use-hunt-events";

type Punch = { key: string; code: number | null; title: string; points: number | null; seed: string };

/**
 * Mounted once by PlayerShell for players who joined a team: tells them the
 * moment a judge decides on their submission, and refreshes the page. An
 * accepted task also gets the "Punched!" moment (one after another when
 * several land at once).
 */
export function PlayerLive({ huntId, teamId }: { huntId: string; teamId: string }) {
  const router = useRouter();
  // Deferred a tick: an event that lands during hydration must not reach the router before it's ready.
  const refresh = () => setTimeout(() => router.refresh(), 0);
  const [queue, setQueue] = useState<Punch[]>([]);
  const celebrated = useRef(new Set<string>());

  useHuntEvents(huntId, (e) => {
    if (e.type === "submission.judged" && e.teamId === teamId) {
      const what = e.taskTitle ?? "your submission";
      // The task or checkpoint page on this phone is already showing this result.
      const inline = resultShownInline(e.taskId);
      if (e.status === "approved") {
        if (!inline) {
          toast({
            title: `Accepted: ${what}`,
            description: e.points ? `${formatSigned(e.points)} points` : undefined,
            tone: "success",
          });
        }
        // Browsers refuse (and log an error) until the page has been tapped at least once.
        if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([30, 40, 30]);
        // Re-judging an accepted submission (e.g. a points change) doesn't celebrate twice,
        // and contest entries are placements, not punches.
        if (e.taskKind !== "contest" && !celebrated.current.has(e.submissionId)) {
          celebrated.current.add(e.submissionId);
          const punch: Punch = {
            key: `${e.submissionId}:${e.seq}`,
            code: e.taskCode ?? null,
            title: e.taskTitle ?? "Task accepted",
            points: e.points ?? null,
            seed: e.taskId,
          };
          setQueue((q) => [...q, punch].slice(-4));
        }
      } else if (e.status === "rejected" && !inline) {
        toast({
          title: `Not accepted: ${what}`,
          description: e.feedback ?? "Open the task to see why.",
          tone: "danger",
        });
      }
      refresh();
    } else if (e.type === "announcement.created") {
      toast({ title: e.title || "New announcement", description: e.body, tone: "accent", durationMs: 8000 });
      refresh();
    } else if (e.type === "tasks.changed" || e.type === "hunt.changed") {
      refresh();
    }
  });

  const current = queue[0];
  if (!current) return null;
  return (
    <PunchCelebration
      key={current.key}
      code={current.code}
      title={current.title}
      points={current.points}
      seed={current.seed}
      onDone={() => setQueue((q) => q.filter((p) => p.key !== current.key))}
    />
  );
}
