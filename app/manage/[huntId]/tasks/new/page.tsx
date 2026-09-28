import { ArrowLeft, Lightbulb, Paperclip } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArchivedNotice } from "@/components/staff/archived-notice";
import { TaskForm, type TaskFormValues } from "@/components/staff/task-editor/task-form";
import { requireStaff } from "@/lib/auth/access";
import { TASK_KINDS, type TaskKind } from "@/lib/db/schema";
import { nextTaskCode, uniqueCheckpointCode } from "@/lib/staff/codes";
import { isArchived } from "@/lib/staff/guards";
import { staffTitle } from "@/lib/staff/metadata";
import { taskCategories } from "@/lib/staff/queries";

export async function generateMetadata({ params }: { params: Promise<{ huntId: string }> }): Promise<Metadata> {
  return staffTitle((await params).huntId, "New task", { min: "organizer" });
}

export default async function NewTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ huntId: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { huntId } = await params;
  const sp = await searchParams;
  const { hunt } = await requireStaff(huntId, "organizer");
  const back = (
    <Link
      href={`/manage/${hunt.id}/tasks`}
      className="inline-flex h-11 items-center gap-2 self-start text-sm font-semibold text-ink-2 hover:text-ink"
    >
      <ArrowLeft aria-hidden className="size-4" />
      All tasks
    </Link>
  );
  if (isArchived(hunt)) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <h1 className="font-cond text-4xl font-extrabold tracking-tight">New task</h1>
        <ArchivedNotice huntId={hunt.id}>New tasks can’t be added while it’s archived.</ArchivedNotice>
      </div>
    );
  }
  const [code, checkpointCode, categories] = await Promise.all([
    nextTaskCode(hunt.id),
    uniqueCheckpointCode(hunt.id),
    taskCategories(hunt.id),
  ]);
  const kind = (TASK_KINDS as readonly string[]).includes(sp.kind ?? "") ? (sp.kind as TaskKind) : "media";
  const values: TaskFormValues = {
    id: null,
    code,
    title: "",
    description: "",
    kind,
    category: null,
    mediaAccept: "photo",
    autoApprove: false,
    answers: [],
    answerMatch: "loose",
    maxAttempts: null,
    checkpointCode,
    scoring: "fixed",
    points: 100,
    minPoints: 40,
    decaySolves: 6,
    contestRank: "highest",
    contestPlaces: 3,
    contestUnit: null,
    unlockAt: null,
    lockAt: null,
    hidden: false,
  };

  return (
    <div className="flex flex-col gap-6">
      {back}
      <header>
        <h1 className="font-cond text-4xl font-extrabold tracking-tight">New task</h1>
        <p className="mt-1.5 max-w-prose text-ink-2">
          A control on your course. Pick what teams send, write what to do, and decide what it’s worth.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-x-10 gap-y-12 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <TaskForm
          huntId={hunt.id}
          values={values}
          categories={categories}
          submissionCount={0}
          printHref={null}
          cancelHref={`/manage/${hunt.id}/tasks`}
        />
        <aside className="flex flex-col gap-3 self-start rounded-lg border border-dashed border-line-strong p-5 text-sm text-ink-2">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <Lightbulb aria-hidden className="size-4" />
            Hints and attachments
          </p>
          <p>Once the task is saved, you can add hints teams can buy with points, and photos or PDFs they can open.</p>
          <p className="flex items-center gap-2">
            <Paperclip aria-hidden className="size-4" />
            Maps and clue sheets work well as attachments.
          </p>
        </aside>
      </div>
    </div>
  );
}
