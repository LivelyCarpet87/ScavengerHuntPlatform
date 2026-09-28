import { and, desc, eq } from "drizzle-orm";
import type { ControlState } from "@/components/ui/control";
import { db } from "@/lib/db";
import { hintUnlocks, type Submission, submissions } from "@/lib/db/schema";

export type TaskProgress = {
  /** todo · pending (waiting for a judge) · approved · rejected (latest attempt failed). */
  state: Exclude<ControlState, "locked">;
  /** All of the team's submissions for the task, newest first. */
  submissions: Submission[];
  /** Rejected attempts (used for answer attempt limits). */
  wrongAttempts: number;
  /** When the team first got it accepted. */
  approvedAt: Date | null;
};

/**
 * A team's progress on every task it has touched. Tasks without submissions
 * are absent — treat them as "todo".
 *
 * Rules: any approved submission makes a standard task "approved". Otherwise
 * the newest submission decides: pending → "pending", rejected → "rejected".
 * Contest tasks stay "approved" once any entry is accepted (teams may keep
 * submitting entries).
 */
export async function getTeamProgress(teamId: string): Promise<Map<string, TaskProgress>> {
  const rows = await db
    .select()
    .from(submissions)
    .where(eq(submissions.teamId, teamId))
    .orderBy(desc(submissions.createdAt));
  const out = new Map<string, TaskProgress>();
  for (const sub of rows) {
    let p = out.get(sub.taskId);
    if (!p) {
      p = { state: "todo", submissions: [], wrongAttempts: 0, approvedAt: null };
      out.set(sub.taskId, p);
    }
    p.submissions.push(sub);
    if (sub.status === "rejected") p.wrongAttempts += 1;
    if (sub.status === "approved" && (!p.approvedAt || sub.createdAt < p.approvedAt)) p.approvedAt = sub.createdAt;
  }
  for (const p of out.values()) {
    const newest = p.submissions[0];
    p.state = p.approvedAt ? "approved" : newest.status === "pending" ? "pending" : "rejected";
  }
  return out;
}

export function progressState(progress: Map<string, TaskProgress>, taskId: string): TaskProgress["state"] {
  return progress.get(taskId)?.state ?? "todo";
}

/** Hint ids the team has revealed. */
export async function getRevealedHints(teamId: string): Promise<Set<string>> {
  const rows = await db.select({ hintId: hintUnlocks.hintId }).from(hintUnlocks).where(eq(hintUnlocks.teamId, teamId));
  return new Set(rows.map((r) => r.hintId));
}

/** The team's submissions for one task, newest first. */
export async function getTaskSubmissions(teamId: string, taskId: string): Promise<Submission[]> {
  return db
    .select()
    .from(submissions)
    .where(and(eq(submissions.teamId, teamId), eq(submissions.taskId, taskId)))
    .orderBy(desc(submissions.createdAt));
}
