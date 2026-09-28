import "server-only";
import { and, count, desc, eq, inArray, like, notLike, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, type Hunt, submissions, tasks, teams, users } from "@/lib/db/schema";
import { type ActivityGroup, type ActivityLookup, groupPrefixes } from "./activity";
import { ACTIVITY_PAGE_SIZE } from "./constants";
import type { AuditRow } from "./submissions";

function groupCondition(group: ActivityGroup | null): SQL | undefined {
  if (!group) return undefined;
  const { include, exclude } = groupPrefixes(group);
  if (include.length > 0) return or(...include.map((p) => like(auditLog.action, `${p}%`)));
  return and(...exclude.map((p) => notLike(auditLog.action, `${p}%`)));
}

export async function loadActivity(hunt: Pick<Hunt, "id">, opts: { group: ActivityGroup | null; page: number }) {
  const where = and(eq(auditLog.huntId, hunt.id), groupCondition(opts.group));
  const total = (await db.select({ n: count() }).from(auditLog).where(where).get())?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page), pages);

  const rows = await db
    .select({ entry: auditLog, actorName: users.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(where)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(ACTIVITY_PAGE_SIZE)
    .offset((page - 1) * ACTIVITY_PAGE_SIZE);

  const submissionIds = rows
    .filter((r) => r.entry.targetKind === "submission" && r.entry.targetId)
    .map((r) => r.entry.targetId as string);
  const [teamRows, taskRows, subRows] = await Promise.all([
    db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.huntId, hunt.id)),
    db.select({ id: tasks.id, code: tasks.code, title: tasks.title }).from(tasks).where(eq(tasks.huntId, hunt.id)),
    submissionIds.length
      ? db
          .select({ id: submissions.id, teamId: submissions.teamId, taskId: submissions.taskId })
          .from(submissions)
          .where(and(eq(submissions.huntId, hunt.id), inArray(submissions.id, [...new Set(submissionIds)])))
      : Promise.resolve([]),
  ]);

  const lookup: ActivityLookup = {
    teams: Object.fromEntries(teamRows.map((t) => [t.id, t.name])),
    tasks: Object.fromEntries(taskRows.map((t) => [t.id, { code: t.code, title: t.title }])),
    submissions: Object.fromEntries(subRows.map((s) => [s.id, { teamId: s.teamId, taskId: s.taskId }])),
  };

  const entries: AuditRow[] = rows.map(({ entry, actorName }) => ({
    id: entry.id,
    action: entry.action,
    targetKind: entry.targetKind,
    targetId: entry.targetId,
    data: entry.data ?? null,
    actorId: entry.actorUserId,
    actorName,
    createdAt: entry.createdAt.getTime(),
  }));

  return { entries, lookup, total, page, pages, existingSubmissions: new Set(subRows.map((s) => s.id)) };
}
