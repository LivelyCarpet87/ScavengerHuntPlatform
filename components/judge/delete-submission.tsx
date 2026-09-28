"use client";

import { Trash } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { deleteSubmission } from "@/lib/judging/actions";

/** "Delete submission" with a confirmation sheet. Organizers only. */
export function DeleteSubmission({
  huntId,
  submissionId,
  teamName,
  taskLabel,
  hasPoints,
  fileCount,
}: {
  huntId: string;
  submissionId: string;
  teamName: string;
  taskLabel: string;
  hasPoints: boolean;
  fileCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(deleteSubmission, null);
  const what = fileCount === 1 ? "The photo or video" : fileCount > 1 ? `All ${fileCount} files` : "It";

  return (
    <>
      <Button variant="ghost" className="self-start text-danger hover:bg-danger-wash" onClick={() => setOpen(true)}>
        <Trash aria-hidden />
        Delete submission
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this submission?"
        description={`${teamName}, ${taskLabel}`}
      >
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="huntId" value={huntId} />
          <input type="hidden" name="submissionId" value={submissionId} />
          <p className="text-ink-2">
            {what} will be removed for good{hasPoints ? ", along with the points it earned" : ""}. The team can submit
            again while the task is open. To keep a record, reject it instead.
          </p>
          <FormMessage state={state} />
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="danger" size="lg" pendingLabel="Deleting">
              Delete submission
            </SubmitButton>
            <Button variant="quiet" size="lg" onClick={() => setOpen(false)}>
              Keep it
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
