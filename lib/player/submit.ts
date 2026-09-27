import "server-only";
import { and, count, eq, isNotNull } from "drizzle-orm";
import { after } from "next/server";
import { parseCheckpointInput } from "@/components/scan/checkpoint-link";
import type { PlayerContext } from "@/lib/auth/access";
import { db } from "@/lib/db";
import {
  type FileRow,
  type Hunt,
  type Submission,
  type SubmissionStatus,
  submissions,
  type Task,
  tasks,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { isTaskVisible, submissionBlockReason } from "@/lib/hunts";
import { newId, normalizeCode } from "@/lib/ids";
import { matchAnswer } from "@/lib/judging/answers";
import { notifyHuntStaff } from "@/lib/push";
import { rateLimit } from "@/lib/rate-limit";
import { publish } from "@/lib/realtime/bus";
import { getStandings } from "@/lib/scoring/service";
import { deleteFiles, storePoster, storeUpload, UploadError, type UploadKind } from "@/lib/storage";

/*
 * Taking proof from a team: the rules behind POST /api/hunts/[huntId]/submissions
 * (photos, videos, answers, contest entries, typed checkpoint codes) and the
 * checkpoint poster landing page (/h/[slug]/cp/[code]).
 *
 *   1. Idempotency first: a retry with the same clientId returns the original
 *      submission, even if the task has since closed or been completed.
 *   2. Is the task visible and open? Is the team allowed another try?
 *   3. Validate what was sent for the task's kind, store files, insert the row
 *      (re-checking the rules inside a write transaction so two phones on one
 *      team can't both slip through).
 *   4. Decide instantly where the system can (answers with accepted answers,
 *      checkpoint codes, auto-approved photos), publish live events, and nudge
 *      the judges when something is waiting.
 */

export const MAX_FILES = 4;
export const MAX_TEXT = 2000;

export type SubmitFile = { blob: Blob; name: string | null };

export type SubmitRequest = {
  hunt: Hunt;
  me: PlayerContext;
  taskId: string;
  /** Device-generated idempotency key. */
  clientId: string;
  text: string | null;
  files: SubmitFile[];
  /** Poster frame for the first video. */
  poster: Blob | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
};

export type SubmissionSummary = {
  id: string;
  status: SubmissionStatus;
  feedback: string | null;
  /** Points the team now holds for the task (approved only). */
  points: number | null;
};

export type SubmitSuccess = {
  ok: true;
  duplicate?: boolean;
  submission: SubmissionSummary;
  /** Answer tasks with an attempt limit: wrong answers the team has left. */
  attemptsLeft: number | null;
  task: { id: string; code: number; title: string };
};

export type SubmitFailure = {
  ok: false;
  /** HTTP status for the API response. */
  status: number;
  error: string;
  /** Only rate limits are worth retrying later; everything else needs a change. */
  retryable: boolean;
  retryAfterSec?: number;
};

export type SubmitResult = SubmitSuccess | SubmitFailure;

const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;

function failure(status: number, error: string, extra: Partial<SubmitFailure> = {}): SubmitFailure {
  return { ok: false, status, error, retryable: false, ...extra };
}

function uploadKindsFor(task: Pick<Task, "mediaAccept">): UploadKind[] {
  if (task.mediaAccept === "video") return ["video"];
  if (task.mediaAccept === "any") return ["image", "video"];
  return ["image"];
}

function missingMediaMessage(task: Pick<Task, "mediaAccept">): string {
  if (task.mediaAccept === "video") return "Add a video first.";
  if (task.mediaAccept === "any") return "Add a photo or video first.";
  return "Add a photo first.";
}

/** Why the team can't send another submission for a standard task, given its history. */
function historyBlock(
  task: Pick<Task, "kind" | "maxAttempts">,
  rows: { status: SubmissionStatus }[],
): { error: string } | { wrong: number } {
  if (task.kind === "contest") return { wrong: 0 };
  if (rows.some((r) => r.status === "approved")) return { error: "Your team already completed this task." };
  if (rows.some((r) => r.status === "pending")) return { error: "Your last submission is still being reviewed." };
  const wrong = rows.filter((r) => r.status === "rejected").length;
  if (task.kind === "answer" && task.maxAttempts != null && wrong >= task.maxAttempts) {
    return {
      error:
        task.maxAttempts === 1
          ? "Your team has used its only attempt for this task."
          : `Your team has used all ${task.maxAttempts} attempts for this task.`,
    };
  }
  return { wrong };
}

async function wrongAttempts(teamId: string, taskId: string): Promise<number> {
  const row = await db
    .select({ n: count() })
    .from(submissions)
    .where(and(eq(submissions.teamId, teamId), eq(submissions.taskId, taskId), eq(submissions.status, "rejected")))
    .get();
  return row?.n ?? 0;
}

async function pointsFor(huntId: string, teamId: string, taskId: string): Promise<number | null> {
  try {
    const standings = await getStandings(huntId);
    return standings.awards[teamId]?.[taskId] ?? null;
  } catch (err) {
    // The submission is saved either way; the points show up on the next page load.
    console.error("[submit] could not compute points", err);
    return null;
  }
}

async function summarize(
  row: Submission,
  task: Pick<Task, "id" | "code" | "title" | "kind" | "maxAttempts">,
  opts: { duplicate?: boolean; wrongBefore?: number } = {},
): Promise<SubmitSuccess> {
  const points = row.status === "approved" ? await pointsFor(row.huntId, row.teamId, row.taskId) : null;
  let attemptsLeft: number | null = null;
  if (task.kind === "answer" && task.maxAttempts != null) {
    const wrong =
      opts.wrongBefore != null
        ? opts.wrongBefore + (row.status === "rejected" ? 1 : 0)
        : await wrongAttempts(row.teamId, row.taskId);
    attemptsLeft = Math.max(0, task.maxAttempts - wrong);
  }
  return {
    ok: true,
    ...(opts.duplicate ? { duplicate: true } : {}),
    submission: { id: row.id, status: row.status, feedback: row.feedback, points },
    attemptsLeft,
    task: { id: task.id, code: task.code, title: task.title },
  };
}

/** A hunt's checkpoint task for a code from a poster (any spacing or case), or null. */
export async function findCheckpointTask(huntId: string, code: string): Promise<Task | null> {
  const wanted = normalizeCode(code);
  if (!wanted) return null;
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.huntId, huntId), eq(tasks.kind, "checkpoint"), isNotNull(tasks.checkpointCode)));
  return rows.find((t) => t.checkpointCode && normalizeCode(t.checkpointCode) === wanted) ?? null;
}

/** Shared limiter for checkpoint codes (task page and poster landing), per team. */
export function checkpointAttemptLimit(teamId: string) {
  return rateLimit(`checkpoint:${teamId}`, 10, 60_000);
}

/**
 * Limiter for opening poster links whose code matches nothing. The landing page
 * tells a team whether a code exists, so guessing codes through it is capped
 * too; it has its own budget so page refreshes never use up the team's punches.
 */
export function checkpointLookupLimit(teamId: string) {
  return rateLimit(`checkpoint-lookup:${teamId}`, 30, 60_000);
}

export async function submitProof(req: SubmitRequest): Promise<SubmitResult> {
  const { hunt, me } = req;
  const teamId = me.team.id;
  const clientId = req.clientId.trim();
  if (!CLIENT_ID.test(clientId)) return failure(400, "This upload is missing its id. Reload the page and try again.");
  if (!req.taskId) return failure(400, "Choose a task first.");

  // 1. A retry of something we already have: answer with the original outcome.
  const existing = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.teamId, teamId), eq(submissions.clientId, clientId)))
    .get();
  const task = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, req.taskId), eq(tasks.huntId, hunt.id)))
    .get();
  if (existing) {
    if (!task || existing.taskId !== task.id) return failure(409, "This upload id was already used for another task.");
    return summarize(existing, task, { duplicate: true });
  }

  // 2. Is the task open to this team right now?
  if (!task || !isTaskVisible(task)) return failure(404, "This task isn't available.");
  const blocked = submissionBlockReason(hunt, task);
  if (blocked) return failure(403, blocked);

  const text = req.text?.trim() ? req.text.trim() : null;
  if (text && text.length > MAX_TEXT)
    return failure(400, `Keep it under ${MAX_TEXT.toLocaleString("en-US")} characters.`);
  const files = req.files.filter((f) => f.blob.size > 0 || f.name);
  if (files.length > MAX_FILES) return failure(400, `Send up to ${MAX_FILES} files at a time.`);

  const teamLimit = rateLimit(`submit:${teamId}`, 20, 60_000);
  if (!teamLimit.ok) {
    return failure(429, `Your team is sending a lot at once. Try again in ${teamLimit.retryAfterSec} s.`, {
      retryable: true,
      retryAfterSec: teamLimit.retryAfterSec,
    });
  }
  if (task.kind === "answer") {
    const limit = rateLimit(`answer:${teamId}:${task.id}`, 10, 60_000);
    if (!limit.ok) {
      return failure(429, `That's a lot of guesses. Try again in ${limit.retryAfterSec} s.`, {
        retryable: true,
        retryAfterSec: limit.retryAfterSec,
      });
    }
  }
  if (task.kind === "checkpoint") {
    const limit = checkpointAttemptLimit(teamId);
    if (!limit.ok) {
      return failure(429, `Too many codes tried. Try again in ${limit.retryAfterSec} s.`, {
        retryable: true,
        retryAfterSec: limit.retryAfterSec,
      });
    }
  }

  // 3. What the task kind needs.
  let storedText = text;
  switch (task.kind) {
    case "media":
      if (files.length === 0) return failure(400, missingMediaMessage(task));
      break;
    case "answer":
      if (files.length > 0) return failure(400, "This task takes a typed answer, not a file.");
      if (!text) return failure(400, "Type your answer first.");
      break;
    case "checkpoint": {
      if (files.length > 0) return failure(400, "This task takes the checkpoint code, not a file.");
      const parsed = text ? parseCheckpointInput(text) : null;
      if (!text) return failure(400, "Enter the code from the checkpoint poster.");
      if (!parsed || !task.checkpointCode || parsed.code !== normalizeCode(task.checkpointCode)) {
        return failure(422, "That code doesn't match this checkpoint.");
      }
      storedText = parsed.code;
      break;
    }
    case "contest":
      if (files.length === 0 && !text) return failure(400, "Add a photo, video or note for your entry.");
      break;
  }
  for (const f of files) {
    if (f.blob.size === 0) return failure(400, `${f.name ? `“${f.name}”` : "That file"} is empty. Choose it again.`);
    if (f.blob.size > env.maxUploadBytes) {
      return failure(413, `That file is too large. The limit is ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB.`);
    }
  }

  // Cheap rejection before anything touches the disk; re-checked in the transaction below.
  const history = await db
    .select({ status: submissions.status })
    .from(submissions)
    .where(and(eq(submissions.teamId, teamId), eq(submissions.taskId, task.id)));
  const pre = historyBlock(task, history);
  if ("error" in pre) return failure(409, pre.error);

  // 4. Decide now when the system can.
  let status: SubmissionStatus = "pending";
  let autoJudged = false;
  let correct: boolean | null = null;
  if (task.kind === "answer" && task.answers.length > 0 && storedText) {
    correct = matchAnswer(storedText, task.answers, task.answerMatch);
    status = correct ? "approved" : "rejected";
    autoJudged = true;
  } else if (task.kind === "checkpoint") {
    status = "approved";
    autoJudged = true;
  } else if (task.kind === "media" && task.autoApprove) {
    status = "approved";
    autoJudged = true;
  }

  // 5. Store files, then the row. Undo the files if anything goes wrong.
  const submissionId = newId();
  const stored: FileRow[] = [];
  try {
    const allow = uploadKindsFor(task);
    for (const [i, f] of files.entries()) {
      stored.push(
        await storeUpload({
          file: f.blob,
          name: f.name,
          huntId: hunt.id,
          ownerKind: "submission",
          ownerId: submissionId,
          allow,
          sortOrder: i,
        }),
      );
    }
    const firstVideo = stored.find((f) => f.kind === "video");
    if (firstVideo && req.poster && req.poster.size > 0) {
      try {
        const withPoster = await storePoster(firstVideo, req.poster);
        stored[stored.indexOf(firstVideo)] = withPoster;
      } catch (err) {
        // A missing poster only costs the thumbnail; keep the video.
        console.warn("[submit] could not store video poster", err);
      }
    }
  } catch (err) {
    await deleteFiles(stored).catch(() => {});
    if (err instanceof UploadError) {
      const status = /too large/i.test(err.message) ? 413 : /isn't supported/i.test(err.message) ? 415 : 400;
      return failure(status, err.message);
    }
    throw err;
  }

  const now = new Date();
  let outcome:
    | { kind: "created"; row: Submission; wrongBefore: number }
    | { kind: "duplicate"; row: Submission }
    | { kind: "blocked"; error: string };
  try {
    // libSQL opens write transactions with BEGIN IMMEDIATE, so this check-then-insert is serialized.
    outcome = await db.transaction(async (tx) => {
      const dup = await tx
        .select()
        .from(submissions)
        .where(and(eq(submissions.teamId, teamId), eq(submissions.clientId, clientId)))
        .get();
      if (dup) return { kind: "duplicate" as const, row: dup };
      const rows = await tx
        .select({ status: submissions.status })
        .from(submissions)
        .where(and(eq(submissions.teamId, teamId), eq(submissions.taskId, task.id)));
      const check = historyBlock(task, rows);
      if ("error" in check) return { kind: "blocked" as const, error: check.error };
      const lastTry = correct === false && task.maxAttempts != null && check.wrong + 1 >= task.maxAttempts;
      const feedback =
        correct === true
          ? "Correct!"
          : correct === false
            ? lastTry
              ? "Not quite, and that was your last attempt."
              : "Not quite — try again."
            : null;
      const [row] = await tx
        .insert(submissions)
        .values({
          id: submissionId,
          huntId: hunt.id,
          taskId: task.id,
          teamId,
          playerId: me.player.id,
          clientId,
          text: storedText,
          status,
          feedback,
          autoJudged,
          judgedAt: status === "pending" ? null : now,
          lat: req.lat,
          lng: req.lng,
          accuracy: req.accuracy,
          createdAt: now,
        })
        .returning();
      return { kind: "created" as const, row, wrongBefore: check.wrong };
    });
  } catch (err) {
    await deleteFiles(stored).catch(() => {});
    throw err;
  }

  if (outcome.kind !== "created") {
    await deleteFiles(stored).catch(() => {});
    if (outcome.kind === "blocked") return failure(409, outcome.error);
    if (outcome.row.taskId !== task.id) return failure(409, "This upload id was already used for another task.");
    return summarize(outcome.row, task, { duplicate: true });
  }

  // 6. Tell everyone watching. The first publish invalidates cached standings,
  // so points computed after it include this submission.
  const row = outcome.row;
  const display = { teamName: me.team.name, taskTitle: task.title, taskCode: task.code, taskKind: task.kind };
  publish(hunt.id, { type: "submission.created", submissionId: row.id, teamId, taskId: task.id, ...display });
  const result = await summarize(row, task, { wrongBefore: outcome.wrongBefore });
  if (row.status !== "pending") {
    publish(hunt.id, {
      type: "submission.judged",
      submissionId: row.id,
      teamId,
      taskId: task.id,
      status: row.status,
      points: result.submission.points,
      feedback: row.feedback,
      ...display,
    });
  } else {
    scheduleJudgeNudge(hunt, me.team.name, task.title);
  }
  return result;
}

// Judges get at most one push per hunt per minute; the notification tag makes
// later ones replace earlier ones on the device anyway.
type NudgeGlobal = { __shpJudgeNudge?: Map<string, number> };
const g = globalThis as NudgeGlobal;
const lastNudge = g.__shpJudgeNudge ?? new Map<string, number>();
g.__shpJudgeNudge = lastNudge;
const NUDGE_EVERY_MS = 60_000;

function scheduleJudgeNudge(hunt: Pick<Hunt, "id">, teamName: string, taskTitle: string) {
  const now = Date.now();
  if (now - (lastNudge.get(hunt.id) ?? 0) < NUDGE_EVERY_MS) return;
  lastNudge.set(hunt.id, now);
  after(async () => {
    try {
      const waiting = await db
        .select({ n: count() })
        .from(submissions)
        .where(and(eq(submissions.huntId, hunt.id), eq(submissions.status, "pending")))
        .get();
      const n = waiting?.n ?? 1;
      await notifyHuntStaff(hunt.id, {
        title: n === 1 ? "1 submission to judge" : `${n} submissions to judge`,
        body: `${teamName} sent “${taskTitle}”.`,
        url: `/manage/${hunt.id}/judge`,
        tag: `judge-${hunt.id}`,
      });
    } catch (err) {
      console.warn("[submit] judge push failed", err);
    }
  });
}
