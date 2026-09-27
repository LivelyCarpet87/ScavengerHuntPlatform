"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { resultShownInline } from "@/components/task/inline-results";
import { toast } from "@/components/ui/toast";
import { formatSigned } from "@/lib/format";
import { PunchCelebration } from "./punch-celebration";
import { requestRefresh } from "./refresh";
import { useHuntEvents } from "./use-hunt-events";

type Punch = { key: string; code: number | null; title: string; points: number | null; seed: string };

/**
 * Mounted once by PlayerShell for players who joined a team: tells them the
 * moment a judge decides on their submission, and refreshes the page. An
 * accepted task also gets the "Punched!" moment (one after another when
 * several land at once). Decisions made while the phone had no signal arrive
 * when it reconnects.
 */
export function PlayerLive({ huntId, teamId }: { huntId: string; teamId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [queue, setQueue] = useState<Punch[]>([]);
  // For screen readers, when the page shows a decision in place instead of a toast.
  const [said, setSaid] = useState("");
  const celebrated = useRef(new Set<string>());

  const say = (text: string) => setSaid((prev) => (prev === text ? `${text} ` : text));

  useHuntEvents(
    huntId,
    (e) => {
      if (e.type === "submission.judged" && e.teamId === teamId) {
        if (e.status === "approved" || e.status === "rejected") {
          const approved = e.status === "approved";
          const what = e.taskTitle ?? "your submission";
          // Re-judging an accepted submission (e.g. a points change) doesn't celebrate twice,
          // and contest entries are placements, not punches.
          const celebrate = approved && e.taskKind !== "contest" && !celebrated.current.has(e.submissionId);
          // The form on this phone that sent it is already showing the result.
          if (!resultShownInline(e.taskId)) {
            const title = `${approved ? "Accepted" : "Not accepted"}: ${what}`;
            if (pathname.endsWith(`/tasks/${e.taskId}`)) {
              // The task is open: the page shows the decision (and the judge's words) in place, and
              // "Punched!" announces itself. A toast would only cover it.
              if (!celebrate) say(e.feedback ? `${title}. The judge says: ${e.feedback}` : `${title}.`);
            } else if (approved) {
              toast({
                title,
                description: e.points ? `${formatSigned(e.points)} points` : undefined,
                tone: "success",
              });
            } else {
              toast({ title, description: e.feedback ?? "Open the task to see why.", tone: "danger" });
            }
          }
          if (approved) {
            // Browsers refuse (and log an error) until the page has been tapped at least once.
            if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([30, 40, 30]);
          }
          if (celebrate) {
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
        }
        requestRefresh(router);
      } else if (e.type === "announcement.created") {
        toast({ title: e.title || "New announcement", description: e.body, tone: "accent", durationMs: 8000 });
        requestRefresh(router);
      } else if (e.type === "tasks.changed" || e.type === "hunt.changed") {
        requestRefresh(router);
      }
    },
    { viewer: `team:${teamId}`, onResync: () => requestRefresh(router) },
  );

  const current = queue[0];
  return (
    <>
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
      {current ? (
        <PunchCelebration
          key={current.key}
          code={current.code}
          title={current.title}
          points={current.points}
          seed={current.seed}
          onDone={() => setQueue((q) => q.filter((p) => p.key !== current.key))}
        />
      ) : null}
    </>
  );
}
