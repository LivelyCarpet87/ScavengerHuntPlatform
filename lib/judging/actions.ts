"use server";

import { and, eq, isNull, lt, ne, or, type SQL } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { type ActionState, fail, ok, parseForm } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { getStaffRole, requireStaff } from "@/lib/auth/access";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { adjustments, files, type Hunt, submissions, tasks, teams, type User, users } from "@/lib/db/schema";
import { formatRelative, formatSigned } from "@/lib/format";
import { getHuntById } from "@/lib/hunts";
import { notifyTeam } from "@/lib/push";
import { type HuntEvent, publish } from "@/lib/realtime/bus";
import { getStandings } from "@/lib/scoring/service";
import { deleteFiles } from "@/lib/storage";
import { links } from "@/lib/url";
import { CLAIM_TTL_MS, PUSH_DELAY_MS } from "./constants";
import type { ClaimResult, JudgeResult } from "./types";

/*
 * Judging and score management. Every action re-checks the caller's staff
 * role for the hunt (actions are public endpoints) and scopes every query by
 * huntId. Mutations players can see publish a bus event; decisions notify
 * the team by push, delayed past the undo window.
 */

const Id = z.string().trim().min(1).max(64);

const ARCHIVED = "This hunt is archived. Restore it in Settings before changing results.";

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Something about that request wasn’t right. Reload and try again.";
}

async function loadSubmission(huntId: string, submissionId: string) {
  return db
    .select({ sub: submissions, task: tasks, team: teams })
    .from(submissions)
    .innerJoin(tasks, eq(tasks.id, submissions.taskId))
    .innerJoin(teams, eq(teams.id, submissions.teamId))
    .where(and(eq(submissions.id, submissionId), eq(submissions.huntId, huntId)))
    .get();
}

/** Explains why a conditional update matched nothing: someone else got there first. */
async function staleReason(huntId: string, submissionId: string, viewerId: string): Promise<JudgeResult> {
  const row = await db
    .select({
      status: submissions.status,
      judgedAt: submissions.judgedAt,
      judgedBy: submissions.judgedBy,
      autoJudged: submissions.autoJudged,
      name: users.name,
    })
    .from(submissions)
    .leftJoin(users, eq(users.id, submissions.judgedBy))
    .where(and(eq(submissions.id, submissionId), eq(submissions.huntId, huntId)))
    .get();
  if (!row) return { ok: false, stale: true, error: "That submission was deleted." };
  if (row.status === "pending") {
    return { ok: false, stale: true, error: "Someone put this submission back in review. Reload to see it." };
  }
  const verb = row.status === "approved" ? "approved" : "rejected";
  const when = row.judgedAt ? formatRelative(row.judgedAt) : "";
  if (row.autoJudged) return { ok: false, stale: true, error: `This submission was ${verb} automatically ${when}.` };
  if (row.judgedBy === viewerId) return { ok: false, stale: true, error: `You already ${verb} this ${when}.` };
  const who = row.name?.split(" ")[0] ?? "Another judge";
  return { ok: false, stale: true, error: `${who} ${verb} this ${when}. Reload to see their decision.` };
}

/** Sends the result push after the undo window, only if the decision still stands. */
function notifyDecisionLater(opts: {
  hunt: Pick<Hunt, "id" | "slug">;
  /** Player-visible copy of the decision, released once the undo window has passed. */
  release?: HuntEvent;
  /** Send the team a push notification (only when the status actually changed). */
  push: boolean;
  submissionId: string;
  teamId: string;
  taskId: string;
  taskTitle: string;
  status: "approved" | "rejected";
  judgedAt: number;
  points: number;
  feedback: string | null;
}) {
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, PUSH_DELAY_MS));
    const now = await db
      .select({ status: submissions.status, judgedAt: submissions.judgedAt })
      .from(submissions)
      .where(eq(submissions.id, opts.submissionId))
      .get();
    if (!now || now.status !== opts.status || now.judgedAt?.getTime() !== opts.judgedAt) return;
    if (opts.release) publish(opts.hunt.id, opts.release);
    if (!opts.push) return;
    const approved = opts.status === "approved";
    const points = `${formatSigned(opts.points)} points`;
    await notifyTeam(opts.teamId, {
      title: `${approved ? "Accepted" : "Not accepted"}: ${opts.taskTitle}`,
      body: approved
        ? opts.feedback
          ? `${points}. ${opts.feedback}`
          : points
        : (opts.feedback ?? "Open the task to see what to change."),
      url: links.task(opts.hunt.slug, opts.taskId),
      tag: opts.submissionId,
    });
  });
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

const JudgeSchema = z.object({
  huntId: Id,
  submissionId: Id,
  decision: z.enum(["approve", "reject"]),
  pointsOverride: z
    .number({ message: "Points must be a whole number." })
    .int("Points must be a whole number.")
    .min(-100_000, "That’s too many points.")
    .max(100_000, "That’s too many points.")
    .nullable()
    .optional(),
  contestValue: z
    .number({ message: "The measured value must be a number." })
    .min(-1e12, "That value is out of range.")
    .max(1e12, "That value is out of range.")
    .nullable()
    .optional(),
  feedback: z.string().max(1000, "Keep feedback under 1,000 characters.").nullable().optional(),
  /** null: only if still pending · number: only if judgedAt still equals it · omitted: unconditional. */
  expectedJudgedAt: z.number().int().nullable().optional(),
  from: z.enum(["queue", "detail"]).optional(),
});

export type JudgeInput = z.input<typeof JudgeSchema>;

type LostAccess = { ok: false; error: string; lostAccess: true };

/**
 * The caller's staff identity for a decision, or why they can't decide
 * anymore. Unlike requireStaff it never throws: the queue calls these
 * actions directly, and a thrown notFound() or redirect would reach the judge
 * as a network error ("Couldn’t reach the server") instead of the reason.
 */
async function deciderFor(huntId: string): Promise<{ user: User; hunt: Hunt } | LostAccess> {
  const current = await getSession();
  if (!current?.user) {
    return { ok: false, lostAccess: true, error: "You’re signed out. Sign in again to keep judging." };
  }
  const [role, hunt] = await Promise.all([getStaffRole(huntId), getHuntById(huntId)]);
  // Checked before the hunt, so this can't be used to find out which hunts exist.
  if (!role) return { ok: false, lostAccess: true, error: "You’re no longer on this hunt’s staff." };
  if (!hunt) return { ok: false, lostAccess: true, error: "This hunt was deleted." };
  return { user: current.user, hunt };
}

/** Approve or reject a submission (also used to re-judge one that was already decided). */
export async function judgeSubmission(input: JudgeInput): Promise<JudgeResult> {
  const parsed = JudgeSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return {
      ok: false,
      error: firstIssue(parsed.error),
      field: field === "contestValue" || field === "pointsOverride" || field === "feedback" ? field : undefined,
    };
  }
  const data = parsed.data;
  const access = await deciderFor(data.huntId);
  if ("error" in access) return access;
  const { user, hunt } = access;
  if (hunt.status === "archived") return { ok: false, error: ARCHIVED };

  const row = await loadSubmission(hunt.id, data.submissionId);
  if (!row) return { ok: false, stale: true, error: "That submission was deleted." };
  const { sub, task, team } = row;

  const approve = data.decision === "approve";
  const isContest = task.kind === "contest";
  const contestValue = approve && isContest ? (data.contestValue ?? null) : null;
  if (approve && isContest && task.contestRank !== "earliest" && contestValue == null) {
    return {
      ok: false,
      field: "contestValue",
      error: `Enter the measured value${task.contestUnit ? ` in ${task.contestUnit}` : ""} before approving.`,
    };
  }
  const pointsOverride = approve && !isContest ? (data.pointsOverride ?? null) : null;
  const feedback = data.feedback?.trim() ? data.feedback.trim() : null;
  const status = approve ? ("approved" as const) : ("rejected" as const);
  const judgedAt = new Date();

  const where: SQL[] = [eq(submissions.id, sub.id), eq(submissions.huntId, hunt.id)];
  if (data.expectedJudgedAt === null) where.push(eq(submissions.status, "pending"));
  else if (typeof data.expectedJudgedAt === "number")
    where.push(eq(submissions.judgedAt, new Date(data.expectedJudgedAt)));

  const updated = await db
    .update(submissions)
    .set({
      status,
      judgedBy: user.id,
      judgedAt,
      feedback,
      pointsOverride,
      contestValue,
      autoJudged: false,
      claimedBy: null,
      claimedAt: null,
    })
    .where(and(...where))
    .returning({ id: submissions.id });
  if (updated.length === 0) return staleReason(hunt.id, sub.id, user.id);

  // Decisions made in the queue can be undone for a few seconds: staff hear about
  // them at once, players only once the undo window has passed (see notifyDecisionLater).
  const holdForUndo = data.from === "queue";
  const audience = holdForUndo ? ("staff" as const) : undefined;

  // Invalidate cached standings first so the points we report include this decision.
  publish(hunt.id, { type: "scores.changed", teamId: team.id }, { audience });
  const standings = await getStandings(hunt.id);
  const points = standings.awards[team.id]?.[task.id] ?? 0;

  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: approve ? "submission.approve" : "submission.reject",
    targetKind: "submission",
    targetId: sub.id,
    data: {
      teamId: team.id,
      teamName: team.name,
      taskId: task.id,
      taskCode: task.code,
      taskTitle: task.title,
      points,
      before: {
        status: sub.status,
        autoJudged: sub.autoJudged,
        pointsOverride: sub.pointsOverride,
        contestValue: sub.contestValue,
        feedback: sub.feedback,
      },
      after: { status, pointsOverride, contestValue, feedback },
    },
  });

  const judged: HuntEvent = {
    type: "submission.judged",
    submissionId: sub.id,
    teamId: team.id,
    taskId: task.id,
    status,
    points,
    feedback,
    teamName: team.name,
    taskTitle: task.title,
    taskCode: task.code,
    taskKind: task.kind,
  };
  publish(hunt.id, judged, { audience });

  if (holdForUndo || sub.status !== status) {
    notifyDecisionLater({
      hunt,
      release: holdForUndo ? judged : undefined,
      push: sub.status !== status,
      submissionId: sub.id,
      teamId: team.id,
      taskId: task.id,
      taskTitle: task.title,
      status,
      judgedAt: judgedAt.getTime(),
      points,
      feedback,
    });
  }
  if (data.from === "detail") refresh();

  return {
    ok: true,
    status,
    points,
    judgedAt: judgedAt.getTime(),
    message: approve ? `Approved ${team.name}` : `Rejected ${team.name}`,
  };
}

const RevertSchema = z.object({
  huntId: Id,
  submissionId: Id,
  expectedJudgedAt: z.number().int().nullable().optional(),
  from: z.enum(["queue", "detail"]).optional(),
});

/** Puts a decided submission back in review (undo, reopen). The reverting judge keeps it claimed. */
export async function revertJudgement(input: z.input<typeof RevertSchema>): Promise<JudgeResult> {
  const parsed = RevertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const data = parsed.data;
  const access = await deciderFor(data.huntId);
  if ("error" in access) return access;
  const { user, hunt } = access;
  if (hunt.status === "archived") return { ok: false, error: ARCHIVED };

  const row = await loadSubmission(hunt.id, data.submissionId);
  if (!row) return { ok: false, stale: true, error: "That submission was deleted." };
  const { sub, task, team } = row;
  if (sub.status === "pending") return { ok: false, stale: true, error: "This submission is already in review." };

  const where: SQL[] = [eq(submissions.id, sub.id), eq(submissions.huntId, hunt.id), ne(submissions.status, "pending")];
  if (typeof data.expectedJudgedAt === "number") where.push(eq(submissions.judgedAt, new Date(data.expectedJudgedAt)));
  const updated = await db
    .update(submissions)
    .set({
      status: "pending",
      judgedBy: null,
      judgedAt: null,
      feedback: null,
      pointsOverride: null,
      contestValue: null,
      autoJudged: false,
      claimedBy: user.id,
      claimedAt: new Date(),
    })
    .where(and(...where))
    .returning({ id: submissions.id });
  if (updated.length === 0) return staleReason(hunt.id, sub.id, user.id);

  publish(hunt.id, { type: "scores.changed", teamId: team.id });
  const standings = await getStandings(hunt.id);
  const points = standings.awards[team.id]?.[task.id] ?? 0;

  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "submission.revert",
    targetKind: "submission",
    targetId: sub.id,
    data: {
      teamId: team.id,
      teamName: team.name,
      taskId: task.id,
      taskCode: task.code,
      taskTitle: task.title,
      points,
      before: {
        status: sub.status,
        autoJudged: sub.autoJudged,
        pointsOverride: sub.pointsOverride,
        contestValue: sub.contestValue,
        feedback: sub.feedback,
      },
      after: { status: "pending" },
    },
  });

  publish(hunt.id, {
    type: "submission.judged",
    submissionId: sub.id,
    teamId: team.id,
    taskId: task.id,
    status: "pending",
    points,
    feedback: null,
    teamName: team.name,
    taskTitle: task.title,
    taskCode: task.code,
    taskKind: task.kind,
  });
  if (data.from === "detail") refresh();

  return { ok: true, status: "pending", points, judgedAt: null, message: `${team.name} is back in the queue` };
}

// ---------------------------------------------------------------------------
// Soft claims
// ---------------------------------------------------------------------------

/**
 * The caller's staff identity on a hunt, or null — without redirecting.
 * Claims are renewed and released in the background (on a timer, when the
 * queue unmounts): a redirect from one of those calls would yank a judge who
 * just signed out, or whose session lapsed, to the login page mid-navigation.
 */
async function quietStaff(huntId: string) {
  const current = await getSession();
  if (!current?.user) return null;
  const [role, hunt] = await Promise.all([getStaffRole(huntId), getHuntById(huntId)]);
  if (!role || !hunt) return null;
  return { user: current.user, hunt };
}

const ClaimSchema = z.object({ huntId: Id, submissionId: Id, releaseId: Id.nullable().optional() });

/**
 * Marks a submission as being reviewed by the caller so other judges' queues
 * pass over it. Claims lapse after CLAIM_TTL_MS unless renewed. Optionally
 * releases the caller's claim on the submission they just left.
 */
export async function claimSubmission(input: z.input<typeof ClaimSchema>): Promise<ClaimResult> {
  const parsed = ClaimSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { huntId, submissionId, releaseId } = parsed.data;
  const staff = await quietStaff(huntId);
  if (!staff) return { ok: false, lostAccess: true, error: "You’re no longer on this hunt’s staff." };
  const { user, hunt } = staff;

  if (releaseId && releaseId !== submissionId) {
    await db
      .update(submissions)
      .set({ claimedBy: null, claimedAt: null })
      .where(and(eq(submissions.id, releaseId), eq(submissions.huntId, hunt.id), eq(submissions.claimedBy, user.id)));
  }

  const lapsed = new Date(Date.now() - CLAIM_TTL_MS);
  const claimed = await db
    .update(submissions)
    .set({ claimedBy: user.id, claimedAt: new Date() })
    .where(
      and(
        eq(submissions.id, submissionId),
        eq(submissions.huntId, hunt.id),
        eq(submissions.status, "pending"),
        or(
          isNull(submissions.claimedBy),
          eq(submissions.claimedBy, user.id),
          isNull(submissions.claimedAt),
          lt(submissions.claimedAt, lapsed),
        ),
      ),
    )
    .returning({ id: submissions.id });
  if (claimed.length > 0) return { ok: true, claimed: true };

  const row = await db
    .select({
      status: submissions.status,
      claimedBy: submissions.claimedBy,
      claimedAt: submissions.claimedAt,
      name: users.name,
    })
    .from(submissions)
    .leftJoin(users, eq(users.id, submissions.claimedBy))
    .where(and(eq(submissions.id, submissionId), eq(submissions.huntId, hunt.id)))
    .get();
  if (!row) return { ok: false, error: "That submission was deleted." };
  if (row.status !== "pending" || !row.claimedBy) return { ok: true, claimed: false, judged: true };
  return {
    ok: true,
    claimed: false,
    judged: false,
    by: { userId: row.claimedBy, name: row.name ?? "Another judge", at: row.claimedAt?.getTime() ?? Date.now() },
  };
}

const ReleaseSchema = z.object({ huntId: Id, submissionId: Id });

/** Lets go of the caller's claim (leaving the queue, skipping). */
export async function releaseClaim(input: z.input<typeof ReleaseSchema>): Promise<{ ok: boolean }> {
  const parsed = ReleaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const staff = await quietStaff(parsed.data.huntId);
  if (!staff) return { ok: false };
  const { user, hunt } = staff;
  await db
    .update(submissions)
    .set({ claimedBy: null, claimedAt: null })
    .where(
      and(
        eq(submissions.id, parsed.data.submissionId),
        eq(submissions.huntId, hunt.id),
        eq(submissions.claimedBy, user.id),
      ),
    );
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Deleting a submission
// ---------------------------------------------------------------------------

const DeleteSubmissionSchema = z.object({ huntId: Id, submissionId: Id });

/** Removes a submission and its files for good (organizers). */
export async function deleteSubmission(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(DeleteSubmissionSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  if (hunt.status === "archived") return fail(ARCHIVED);

  const row = await loadSubmission(hunt.id, parsed.data.submissionId);
  if (!row) return fail("That submission was already deleted.");
  const { sub, task, team } = row;

  const fileRows = await db
    .select({ id: files.id, huntId: files.huntId })
    .from(files)
    .where(and(eq(files.ownerKind, "submission"), eq(files.ownerId, sub.id), eq(files.huntId, hunt.id)));
  await db.delete(submissions).where(and(eq(submissions.id, sub.id), eq(submissions.huntId, hunt.id)));
  await deleteFiles(fileRows);

  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "submission.delete",
    targetKind: "submission",
    targetId: sub.id,
    data: {
      teamId: team.id,
      teamName: team.name,
      taskId: task.id,
      taskCode: task.code,
      taskTitle: task.title,
      status: sub.status,
      text: sub.text?.slice(0, 280) ?? null,
      files: fileRows.length,
    },
  });
  publish(hunt.id, { type: "scores.changed", teamId: team.id });

  redirect(`/manage/${hunt.id}/submissions?deleted=${encodeURIComponent(sub.id)}`);
}

// ---------------------------------------------------------------------------
// Score adjustments
// ---------------------------------------------------------------------------

const AdjustmentSchema = z.object({
  huntId: Id,
  teamId: z.string().trim().min(1, "Choose a team."),
  direction: z.enum(["bonus", "penalty"], { message: "Choose bonus or penalty." }),
  amount: z
    .string({ message: "Enter how many points." })
    .trim()
    .min(1, "Enter how many points.")
    .transform(Number)
    .pipe(
      z
        .number({ message: "Points must be a number." })
        .int("Points must be a whole number.")
        .min(1, "Points must be at least 1.")
        .max(100_000, "Points must be at most 100,000."),
    ),
  reason: z
    .string({ message: "Say why. The reason is logged with the adjustment." })
    .trim()
    .min(1, "Say why. The reason is logged with the adjustment.")
    .max(200, "Keep the reason under 200 characters."),
});

/** Adds a bonus or penalty for a team (organizers). */
export async function createAdjustment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(AdjustmentSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { huntId, teamId, direction, amount, reason } = parsed.data;
  const { user, hunt } = await requireStaff(huntId, "organizer");
  if (hunt.status === "archived") return fail(ARCHIVED);

  const team = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.huntId, hunt.id)))
    .get();
  if (!team) return fail("That team isn’t in this hunt anymore.", { teamId: "Choose a team." });

  const points = direction === "bonus" ? amount : -amount;
  const [adjustment] = await db
    .insert(adjustments)
    .values({ huntId: hunt.id, teamId: team.id, points, reason, createdBy: user.id })
    .returning();

  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "adjustment.create",
    targetKind: "adjustment",
    targetId: adjustment.id,
    data: { teamId: team.id, teamName: team.name, points, reason },
  });
  publish(hunt.id, { type: "scores.changed", teamId: team.id });
  after(() =>
    notifyTeam(team.id, {
      title: `${points > 0 ? "Bonus" : "Penalty"}: ${formatSigned(points)} points`,
      body: reason,
      url: links.scoreboard(hunt.slug),
      tag: `adjustment-${adjustment.id}`,
    }),
  );
  refresh();
  return ok(`${points > 0 ? "Bonus" : "Penalty"} added: ${team.name} ${formatSigned(points)}.`);
}

const DeleteAdjustmentSchema = z.object({ huntId: Id, adjustmentId: Id });

/** Removes a bonus or penalty (organizers). */
export async function deleteAdjustment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(DeleteAdjustmentSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  if (hunt.status === "archived") return fail(ARCHIVED);

  const row = await db
    .select({ adjustment: adjustments, teamName: teams.name })
    .from(adjustments)
    .innerJoin(teams, eq(teams.id, adjustments.teamId))
    .where(and(eq(adjustments.id, parsed.data.adjustmentId), eq(adjustments.huntId, hunt.id)))
    .get();
  if (!row) return fail("That adjustment was already removed.");
  const { adjustment, teamName } = row;

  await db.delete(adjustments).where(and(eq(adjustments.id, adjustment.id), eq(adjustments.huntId, hunt.id)));
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "adjustment.delete",
    targetKind: "adjustment",
    targetId: adjustment.id,
    data: {
      teamId: adjustment.teamId,
      teamName,
      points: adjustment.points,
      reason: adjustment.reason,
      createdBy: adjustment.createdBy,
      createdAt: adjustment.createdAt.getTime(),
    },
  });
  publish(hunt.id, { type: "scores.changed", teamId: adjustment.teamId });
  refresh();
  const kind = adjustment.points > 0 ? "bonus" : "penalty";
  return ok(`Removed the ${formatSigned(adjustment.points)} ${kind} for ${teamName}.`);
}
