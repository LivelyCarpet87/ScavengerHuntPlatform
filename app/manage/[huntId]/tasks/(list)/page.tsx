import { CircleCheck, Plus, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LiveRefresh } from "@/components/live/live-refresh";
import { TaskList, type TaskRowData } from "@/components/staff/task-list";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice, PageHeader } from "@/components/ui/misc";
import { requireStaff } from "@/lib/auth/access";
import { formatPoints, plural } from "@/lib/format";
import { type HuntPhase, huntPhase } from "@/lib/hunts";
import { getStandings } from "@/lib/scoring/service";
import { maxTaskPoints, scoringSummary, taskTiming } from "@/lib/staff/format";
import { auditData, hintCounts, listTasks } from "@/lib/staff/queries";
import { kindLabel } from "@/lib/tasks";

function createdVisibility(hidden: boolean, phase: HuntPhase): string {
  if (hidden) return "It stays hidden from players until you switch off “Hidden from players”.";
  if (phase === "draft") return "Players will see it once you publish the hunt.";
  if (phase === "upcoming") return "Players will see it when the hunt starts.";
  if (phase === "live") return "Players can see it now.";
  return "The hunt is over, so players can’t submit to it.";
}

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ huntId: string }>;
  searchParams: Promise<{ saved?: string; did?: string; deleted?: string }>;
}) {
  const { huntId } = await params;
  const sp = await searchParams;
  const { hunt } = await requireStaff(huntId, "organizer");
  const [list, hints, standings, deletedData] = await Promise.all([
    listTasks(hunt.id),
    hintCounts(hunt.id),
    getStandings(hunt.id),
    sp.deleted ? auditData(hunt.id, "task.delete", sp.deleted) : null,
  ]);
  const now = new Date();

  const rows: TaskRowData[] = list.map((t) => {
    const scoring = scoringSummary(t);
    const timing = taskTiming(t, hunt.timezone, now);
    return {
      id: t.id,
      code: t.code,
      title: t.title,
      kindLabel: kindLabel(t),
      isContest: t.kind === "contest",
      category: t.category,
      scoringValue: scoring.value,
      scoringNote: scoring.note,
      hidden: t.hidden,
      unlock: timing.unlock,
      close: timing.close,
      closed: timing.closed,
      solves: standings.tasks[t.id]?.solves ?? 0,
      hints: hints.get(t.id) ?? 0,
    };
  });
  const total = list.reduce((sum, t) => sum + maxTaskPoints(t), 0);
  const checkpoints = list.filter((t) => t.kind === "checkpoint").length;
  const saved = sp.saved ? list.find((t) => t.id === sp.saved) : undefined;
  const deleted = deletedData ? `${String(deletedData.code ?? "")} “${String(deletedData.title ?? "")}”`.trim() : null;

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <LiveRefresh huntId={hunt.id} on={["tasks.changed", "scores.changed"]} />
      <PageHeader
        title="Tasks"
        description={
          list.length === 0
            ? "The controls teams hunt for: photos, answers, checkpoints and contests."
            : `${plural(list.length, "task")}, worth up to ${formatPoints(total)} points. The order here is the order players see.`
        }
        actions={
          <>
            {checkpoints > 0 ? (
              <ButtonLink href={`/manage/${hunt.id}/print/checkpoints`} variant="secondary">
                <Printer aria-hidden />
                Print checkpoint posters
              </ButtonLink>
            ) : null}
            <ButtonLink href={`/manage/${hunt.id}/tasks/new`} className="hidden md:inline-flex">
              <Plus aria-hidden />
              New task
            </ButtonLink>
          </>
        }
      />

      {saved ? (
        <Notice
          tone="success"
          icon={<CircleCheck className="size-4" />}
          title={`${sp.did === "created" ? "Created" : "Saved"} ${saved.code} “${saved.title}”`}
        >
          {sp.did === "created" ? (
            <>
              {createdVisibility(saved.hidden, huntPhase(hunt, now))}{" "}
              <Link href={`/manage/${hunt.id}/tasks/${saved.id}#hints`} className="font-semibold text-ink underline">
                Add hints or attachments
              </Link>
            </>
          ) : (
            "Scores already reflect any scoring changes."
          )}
        </Notice>
      ) : null}
      {deleted ? (
        <Notice tone="success" icon={<CircleCheck className="size-4" />} title={`Deleted ${deleted}`}>
          Its submissions and files are gone, and scores have been recalculated.
        </Notice>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          action={
            <ButtonLink href={`/manage/${hunt.id}/tasks/new`}>
              <Plus aria-hidden />
              Add the first task
            </ButtonLink>
          }
        >
          Add the first one — most hunts use 10 to 15. Quick photo tasks are the easiest place to start.
        </EmptyState>
      ) : (
        <TaskList huntId={hunt.id} rows={rows} />
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <ButtonLink href={`/manage/${hunt.id}/tasks/new`} size="lg" className="w-full">
          <Plus aria-hidden />
          New task
        </ButtonLink>
      </div>
    </div>
  );
}
