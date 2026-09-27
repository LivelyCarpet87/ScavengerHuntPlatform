"use client";

import { Archive, ArchiveRestore, Undo2 } from "lucide-react";
import type { HuntStatus } from "@/lib/db/schema";
import { setHuntStatusAction } from "@/lib/staff/hunt-actions";
import { ConfirmAction } from "../confirm-action";
import { PublishButton } from "../publish-button";

/** Publish, unpublish, archive and restore — each with a plain statement of what changes. */
export function StatusSection({
  huntId,
  huntName,
  status,
  publishConsequence,
  playerCount,
}: {
  huntId: string;
  huntName: string;
  status: HuntStatus;
  publishConsequence: string;
  playerCount: number;
}) {
  if (status === "draft") {
    return (
      <div className="flex flex-col gap-3">
        <p>
          <span className="font-semibold">Draft.</span> Only staff can see it.
        </p>
        <div>
          <PublishButton huntId={huntId} huntName={huntName} consequence={publishConsequence} />
        </div>
      </div>
    );
  }
  if (status === "archived") {
    return (
      <div className="flex flex-col gap-3">
        <p>
          <span className="font-semibold">Archived.</span> Results stay visible. Nothing more can be submitted, and its
          tasks, teams and scores are read-only. It sits in the archive on your dashboard.
        </p>
        <div>
          <ConfirmAction
            action={setHuntStatusAction}
            fields={{ huntId, status: "published" }}
            label="Restore hunt"
            icon={<ArchiveRestore aria-hidden />}
            variant="secondary"
            title={`Restore “${huntName}”?`}
            description="It goes back to being published, following its schedule."
            confirmLabel="Restore hunt"
            confirmVariant="primary"
          />
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p>
        <span className="font-semibold">Published.</span> Teams can find it and take part, following its schedule.
      </p>
      <div className="flex flex-wrap gap-2">
        <ConfirmAction
          action={setHuntStatusAction}
          fields={{ huntId, status: "draft" }}
          label="Switch back to draft"
          icon={<Undo2 aria-hidden />}
          variant="secondary"
          title="Switch back to draft?"
          description={
            playerCount > 0
              ? `${playerCount} ${playerCount === 1 ? "player" : "players"} can’t open the hunt until you publish it again. Teams and submissions are kept.`
              : "Players can’t open the hunt until you publish it again."
          }
          confirmLabel="Switch to draft"
          confirmVariant="primary"
        />
        <ConfirmAction
          action={setHuntStatusAction}
          fields={{ huntId, status: "archived" }}
          label="Archive hunt"
          icon={<Archive aria-hidden />}
          variant="ghost"
          title={`Archive “${huntName}”?`}
          description="Results stay visible to players, but nothing more can be submitted, and its tasks, teams and scores become read-only. It moves to the archive on your dashboard, and you can restore it any time."
          confirmLabel="Archive hunt"
          confirmVariant="primary"
        />
      </div>
    </div>
  );
}
