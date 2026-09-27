import { and, count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { JudgeWorkspace } from "@/components/judge/judge-workspace";
import { getStaffRole, requireStaff, roleAtLeast } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { submissions, TASK_KINDS, type TaskKind } from "@/lib/db/schema";
import { huntPhase } from "@/lib/hunts";
import { loadJudgeQueue } from "@/lib/judging/queue";

type Props = {
  params: Promise<{ huntId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { huntId } = await params;
  if (!(await getStaffRole(huntId))) return { title: "Judge" };
  const pending =
    (
      await db
        .select({ n: count() })
        .from(submissions)
        .where(and(eq(submissions.huntId, huntId), eq(submissions.status, "pending")))
        .get()
    )?.n ?? 0;
  return { title: pending > 0 ? `(${pending}) Judge` : "Judge" };
}

function one(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 64 ? value : null;
}

export default async function JudgePage({ params, searchParams }: Props) {
  const { huntId } = await params;
  const sp = await searchParams;
  const { user, hunt, role } = await requireStaff(huntId, "judge");
  const data = await loadJudgeQueue(hunt, user.id);

  const task = one(sp.task);
  const team = one(sp.team);
  const kind = one(sp.kind);
  const organizer = roleAtLeast(role, "organizer");
  const phase = huntPhase(hunt);

  return (
    <JudgeWorkspace
      huntId={hunt.id}
      me={{ id: user.id, name: user.name }}
      data={data}
      templates={hunt.feedbackTemplates.filter((t) => t.trim().length > 0)}
      initial={{
        id: one(sp.id),
        task: task && data.tasks[task] ? task : null,
        team: team && data.teams[team] ? team : null,
        kind: kind && (TASK_KINDS as readonly string[]).includes(kind) ? (kind as TaskKind) : null,
      }}
      serverNow={Date.now()}
      settingsHref={organizer ? `/manage/${hunt.id}/settings` : null}
      taskHrefBase={organizer ? `/manage/${hunt.id}/tasks/` : null}
      archived={hunt.status === "archived"}
      ended={phase === "ended" || phase === "archived"}
      notStarted={phase === "draft" || phase === "upcoming"}
    />
  );
}
