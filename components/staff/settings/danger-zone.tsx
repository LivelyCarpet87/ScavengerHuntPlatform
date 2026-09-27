"use client";

import { RotateCcw, Trash } from "lucide-react";
import { deleteHuntAction, resetHuntAction } from "@/lib/staff/hunt-actions";
import { ConfirmAction } from "../confirm-action";

/** Owner-only: wipe the results, or delete the hunt entirely. Both need the name typed. */
export function DangerZone({
  huntId,
  huntName,
  counts,
}: {
  huntId: string;
  huntName: string;
  counts: { submissions: number; hintReveals: number; adjustments: number; teams: number; tasks: number };
}) {
  const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
  return (
    <div className="divide-y divide-danger/30 rounded-lg border border-danger/40">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="min-w-0 flex-1 basis-64">
          <h3 className="font-semibold">Reset submissions and scores</h3>
          <p className="text-sm text-ink-2">
            Deletes every submission and photo, hint reveal and adjustment, so every team is back to zero. Teams,
            players and tasks stay. Useful after a test run.
          </p>
        </div>
        <ConfirmAction
          action={resetHuntAction}
          fields={{ huntId }}
          label="Reset hunt"
          icon={<RotateCcw aria-hidden />}
          variant="secondary"
          title="Reset submissions and scores?"
          description={`This deletes ${n(counts.submissions, "submission")} and their photos, ${n(counts.hintReveals, "hint reveal")} and ${n(counts.adjustments, "adjustment")}. It can’t be undone.`}
          confirmLabel="Reset submissions and scores"
          typeToConfirm={huntName}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="min-w-0 flex-1 basis-64">
          <h3 className="font-semibold">Delete hunt</h3>
          <p className="text-sm text-ink-2">
            Removes the hunt with all its teams, tasks, submissions and photos. Links and QR codes stop working.
          </p>
        </div>
        <ConfirmAction
          action={deleteHuntAction}
          fields={{ huntId }}
          label="Delete hunt"
          icon={<Trash aria-hidden />}
          variant="danger"
          title={`Delete “${huntName}”?`}
          description={`This deletes ${n(counts.teams, "team")}, ${n(counts.tasks, "task")} and ${n(counts.submissions, "submission")}, with every photo. It can’t be undone.`}
          confirmLabel="Delete hunt forever"
          typeToConfirm={huntName}
        />
      </div>
    </div>
  );
}
