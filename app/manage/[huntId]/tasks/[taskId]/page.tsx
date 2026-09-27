import { ArrowLeft, CircleCheck, CopyPlus, EyeOff, Trash } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/live/live-refresh";
import { ActionButton } from "@/components/staff/action-button";
import { ArchivedNotice } from "@/components/staff/archived-notice";
import { ConfirmAction } from "@/components/staff/confirm-action";
import { type AttachmentData, AttachmentsEditor } from "@/components/staff/task-editor/attachments-editor";
import { type HintData, HintsEditor } from "@/components/staff/task-editor/hints-editor";
import { TaskForm, type TaskFormValues } from "@/components/staff/task-editor/task-form";
import { ControlMarker } from "@/components/ui/control";
import { Notice } from "@/components/ui/misc";
import { requireStaff } from "@/lib/auth/access";
import { plural } from "@/lib/format";
import { isArchived } from "@/lib/staff/guards";
import { staffTitle } from "@/lib/staff/metadata";
import {
  getTask,
  hintRevealCounts,
  listHints,
  listTaskFiles,
  taskCategories,
  taskSubmissionCount,
} from "@/lib/staff/queries";
import { deleteTaskAction, duplicateTaskAction } from "@/lib/staff/task-actions";
import { fileUrl } from "@/lib/storage";
import { kindLabel } from "@/lib/tasks";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ huntId: string; taskId: string }>;
}): Promise<Metadata> {
  const { huntId, taskId } = await params;
  return staffTitle(huntId, "Edit task", {
    min: "organizer",
    page: async (hunt) => {
      const task = await getTask(hunt.id, taskId);
      return task ? `${task.code} ${task.title}` : null;
    },
  });
}

export default async function EditTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ huntId: string; taskId: string }>;
  searchParams: Promise<{ copied?: string }>;
}) {
  const { huntId, taskId } = await params;
  const sp = await searchParams;
  const { hunt } = await requireStaff(huntId, "organizer");
  const task = await getTask(hunt.id, taskId);
  if (!task) notFound();
  // Archived hunts are read-only: the task shows as it was, without editing.
  const readOnly = isArchived(hunt);

  const [categories, hints, fileRows, submissionCount] = await Promise.all([
    taskCategories(hunt.id),
    listHints(hunt.id, task.id),
    listTaskFiles(hunt.id, task.id),
    taskSubmissionCount(hunt.id, task.id),
  ]);
  const reveals = await hintRevealCounts(
    hunt.id,
    hints.map((h) => h.id),
  );

  const values: TaskFormValues = {
    id: task.id,
    code: task.code,
    title: task.title,
    description: task.description,
    kind: task.kind,
    category: task.category,
    mediaAccept: task.mediaAccept,
    autoApprove: task.autoApprove,
    answers: task.answers,
    answerMatch: task.answerMatch,
    maxAttempts: task.maxAttempts,
    checkpointCode: task.checkpointCode ?? "",
    scoring: task.scoring,
    points: task.points,
    minPoints: task.minPoints,
    decaySolves: task.decaySolves,
    contestRank: task.contestRank,
    contestPlaces: task.contestPlaces,
    contestUnit: task.contestUnit,
    unlockAt: task.unlockAt?.toISOString() ?? null,
    lockAt: task.lockAt?.toISOString() ?? null,
    hidden: task.hidden,
  };
  const hintData: HintData[] = hints.map((h) => ({
    id: h.id,
    body: h.body,
    cost: h.cost,
    reveals: reveals.get(h.id) ?? 0,
  }));
  const attachments: AttachmentData[] = fileRows.map((f) => ({
    id: f.id,
    name: f.originalName ?? `${f.kind === "image" ? "Photo" : "Document"}.${f.ext}`,
    size: f.size,
    isImage: f.kind === "image",
    thumbUrl: fileUrl(f, "thumb"),
    url: fileUrl(f, "original"),
  }));

  const hintPart = hints.length ? `, ${hints.length === 1 ? "its hint" : `its ${plural(hints.length, "hint")}`}` : "";
  const deleteDescription =
    submissionCount > 0
      ? `This also deletes ${submissionCount === 1 ? "its submission and any photos in it" : `its ${plural(submissionCount, "submission")} and their photos`}${hintPart}${attachments.length ? " and its attachments" : ""}. Teams lose the points they earned from it.`
      : `It has no submissions yet.${hints.length || attachments.length ? ` Its ${[hints.length ? plural(hints.length, "hint") : "", attachments.length ? plural(attachments.length, "attachment") : ""].filter(Boolean).join(" and ")} will be deleted too.` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh huntId={hunt.id} on={["tasks.changed"]} />
      <Link
        href={`/manage/${hunt.id}/tasks`}
        className="inline-flex h-11 items-center gap-2 self-start text-sm font-semibold text-ink-2 hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        All tasks
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <ControlMarker code={task.code} size="lg" state={task.hidden ? "locked" : "todo"} />
          <div className="min-w-0">
            <h1 className="font-cond text-4xl font-extrabold tracking-tight text-balance wrap-anywhere">
              {task.title}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 text-ink-2">
              <span>{kindLabel(task)}</span>
              {task.hidden ? (
                <span className="inline-flex items-center gap-1 font-medium text-ink">
                  <EyeOff aria-hidden className="size-4" /> Hidden from players
                </span>
              ) : null}
            </p>
          </div>
        </div>
        {readOnly ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              action={duplicateTaskAction}
              fields={{ huntId: hunt.id, taskId: task.id }}
              variant="quiet"
              pendingLabel="Duplicating"
            >
              <CopyPlus aria-hidden />
              Duplicate
            </ActionButton>
            <ConfirmAction
              action={deleteTaskAction}
              fields={{ huntId: hunt.id, taskId: task.id }}
              label="Delete"
              icon={<Trash aria-hidden />}
              variant="ghost"
              className="text-danger"
              title={`Delete ${task.code} “${task.title}”?`}
              description={deleteDescription}
              confirmLabel="Delete task"
            />
          </div>
        )}
      </header>

      {readOnly ? <ArchivedNotice huntId={hunt.id} /> : null}

      {sp.copied ? (
        <Notice tone="success" icon={<CircleCheck className="size-4" />} title="Copy created">
          {sp.copied === "hidden"
            ? "It’s hidden from players until you switch off “Hidden from players” below, so nobody sees it half-edited."
            : "Edit it below. Hints and attachments were copied too."}
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-x-10 gap-y-12 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <TaskForm
          huntId={hunt.id}
          values={values}
          categories={categories}
          submissionCount={submissionCount}
          printHref={task.kind === "checkpoint" ? `/manage/${hunt.id}/print/checkpoints?task=${task.id}` : null}
          cancelHref={`/manage/${hunt.id}/tasks`}
          readOnly={readOnly}
        />
        <div className="flex flex-col gap-12">
          <HintsEditor huntId={hunt.id} taskId={task.id} hints={hintData} readOnly={readOnly} />
          <AttachmentsEditor huntId={hunt.id} taskId={task.id} files={attachments} readOnly={readOnly} />
        </div>
      </div>
    </div>
  );
}
