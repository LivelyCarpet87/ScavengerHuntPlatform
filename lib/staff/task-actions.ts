"use server";

import { and, asc, count, eq, gt, max, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, fail, ok, parseForm, zCheckbox, zOptionalDate } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth/access";
import { db } from "@/lib/db";
import {
  ANSWER_MATCH,
  CONTEST_RANKS,
  files,
  type Hunt,
  hints,
  hintUnlocks,
  MEDIA_ACCEPT,
  SCORING_MODES,
  submissions,
  TASK_KINDS,
  type Task,
  tasks,
} from "@/lib/db/schema";
import { newId, normalizeCode } from "@/lib/ids";
import { regexAnswerError } from "@/lib/judging/answers";
import { publish } from "@/lib/realtime/bus";
import { deleteFiles, storeUpload, UploadError } from "@/lib/storage";
import { revalidateHunt, runBatch } from "./batch";
import { isUniqueViolation, nextTaskCode, TASK_CODE_MAX, uniqueCheckpointCode } from "./codes";
import { copyFiles, ownedFiles } from "./files";
import { archivedError } from "./guards";
import { parseLines } from "./text";
import { zId, zLongText, zNumber, zOptFile, zOptNumber, zOptText, zText } from "./zod";

/*
 * Task editor actions. Saving publishes tasks.changed (player task lists) and
 * scores.changed (scoring edits recalculate every team's points at once).
 */

const MAX_ANSWERS = 50;

const TaskSchema = z
  .object({
    huntId: zId,
    taskId: z.string().max(64).optional().default(""),
    kind: z.enum(TASK_KINDS, { message: "Choose what kind of task this is." }),
    code: zNumber("the code", { min: 1, max: TASK_CODE_MAX }),
    title: zText("a title", { max: 80 }),
    description: zLongText("the description", 5000),
    category: zOptText("the category", 40),
    mediaAccept: z.enum(MEDIA_ACCEPT).catch("photo"),
    autoApprove: zCheckbox,
    answers: zLongText("the answers", 4000),
    answerMatch: z.enum(ANSWER_MATCH).catch("loose"),
    maxAttempts: zOptNumber("wrong attempts", { min: 1, max: 100 }),
    checkpointCode: z.string().max(40).optional().default(""),
    scoring: z.enum(SCORING_MODES).catch("fixed"),
    points: zNumber("points", { min: 0, max: 10_000 }),
    minPoints: zOptNumber("the minimum", { min: 0, max: 10_000 }),
    decaySolves: zOptNumber("the number of solves", { max: 1000 }),
    contestRank: z.enum(CONTEST_RANKS).catch("highest"),
    contestPlaces: zOptNumber("the number of places", { max: 1000 }),
    contestUnit: zOptText("the unit", 16),
    unlockAt: zOptionalDate,
    lockAt: zOptionalDate,
    hidden: zCheckbox,
  })
  .superRefine((d, ctx) => {
    const decays = d.kind !== "contest" && d.scoring !== "fixed";
    if ((decays || d.kind === "contest") && d.minPoints != null && d.minPoints > d.points) {
      ctx.addIssue({
        code: "custom",
        path: ["minPoints"],
        message:
          d.kind === "contest"
            ? "Last place can’t earn more than 1st place."
            : "The minimum can’t be more than the starting points.",
      });
    }
    if (decays && (d.decaySolves == null || d.decaySolves < 2)) {
      ctx.addIssue({
        code: "custom",
        path: ["decaySolves"],
        message: "Use 2 or more solves: the value needs room to drop.",
      });
    }
    if (d.kind === "contest" && (d.contestPlaces == null || d.contestPlaces < 1 || d.contestPlaces > 20)) {
      ctx.addIssue({ code: "custom", path: ["contestPlaces"], message: "Award between 1 and 20 places." });
    }
    if (d.unlockAt && d.lockAt && d.lockAt <= d.unlockAt) {
      ctx.addIssue({ code: "custom", path: ["lockAt"], message: "Close the task after it unlocks." });
    }
  });

const CHANGE_FIELDS = [
  "code",
  "title",
  "description",
  "kind",
  "category",
  "mediaAccept",
  "autoApprove",
  "answers",
  "answerMatch",
  "maxAttempts",
  "checkpointCode",
  "scoring",
  "points",
  "minPoints",
  "decaySolves",
  "contestRank",
  "contestPlaces",
  "contestUnit",
  "unlockAt",
  "lockAt",
  "hidden",
] as const;

function changedFields(before: Task, after: Record<string, unknown>): string[] {
  const norm = (v: unknown) => (v instanceof Date ? v.getTime() : JSON.stringify(v ?? null));
  return CHANGE_FIELDS.filter((k) => norm(before[k]) !== norm(after[k]));
}

export async function saveTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(TaskSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const { user, hunt } = await requireStaff(d.huntId, "organizer");
  const archived = archivedError(hunt);
  if (archived) return archived;

  const existing = d.taskId
    ? ((await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, d.taskId), eq(tasks.huntId, hunt.id)))
        .get()) ?? null)
    : null;
  if (d.taskId && !existing) return fail("This task no longer exists. Someone may have deleted it.");

  const codeClash = await db
    .select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.huntId, hunt.id), eq(tasks.code, d.code), existing ? ne(tasks.id, existing.id) : undefined))
    .get();
  if (codeClash) {
    return fail(`Code ${d.code} is taken by “${codeClash.title}”.`, { code: "Already used. Pick another code." });
  }

  const answers = parseLines(d.answers).slice(0, MAX_ANSWERS);
  if (d.kind === "answer" && d.answerMatch === "regex") {
    // The same rules the answer checker uses, so a pattern that saves also works.
    for (const [i, pattern] of answers.entries()) {
      const problem = regexAnswerError(pattern);
      if (problem) {
        const message = answers.length > 1 ? `Line ${i + 1}: ${problem}` : problem;
        return fail(message, { answers: message });
      }
    }
  }

  let checkpointCode: string | null = null;
  if (d.kind === "checkpoint") {
    checkpointCode = normalizeCode(d.checkpointCode);
    if (checkpointCode.length < 4 || checkpointCode.length > 16) {
      const message = "Use 4 to 16 letters and numbers for the checkpoint code.";
      return fail(message, { checkpointCode: message });
    }
    const cpClash = await db
      .select({ title: tasks.title })
      .from(tasks)
      .where(
        and(
          eq(tasks.huntId, hunt.id),
          eq(tasks.checkpointCode, checkpointCode),
          existing ? ne(tasks.id, existing.id) : undefined,
        ),
      )
      .get();
    if (cpClash) {
      const message = `“${cpClash.title}” already uses this code. Generate a new one.`;
      return fail(message, { checkpointCode: message });
    }
  }

  const values = {
    code: d.code,
    title: d.title,
    description: d.description.trim(),
    kind: d.kind,
    category: d.category,
    mediaAccept: d.mediaAccept,
    autoApprove: d.kind === "media" ? d.autoApprove : false,
    answers,
    answerMatch: d.answerMatch,
    maxAttempts: d.kind === "answer" ? d.maxAttempts : null,
    checkpointCode,
    scoring: d.kind === "contest" ? ("fixed" as const) : d.scoring,
    points: d.points,
    minPoints: Math.min(d.minPoints ?? 0, d.points),
    decaySolves: Math.max(2, d.decaySolves ?? existing?.decaySolves ?? 10),
    contestRank: d.contestRank,
    contestPlaces: Math.min(Math.max(1, d.contestPlaces ?? existing?.contestPlaces ?? 3), 20),
    contestUnit: d.contestRank === "earliest" ? null : d.contestUnit,
    unlockAt: d.unlockAt,
    lockAt: d.lockAt,
    hidden: d.hidden,
  };

  let taskId: string;
  try {
    if (existing) {
      taskId = existing.id;
      const changed = changedFields(existing, values);
      await db
        .update(tasks)
        .set(values)
        .where(and(eq(tasks.id, existing.id), eq(tasks.huntId, hunt.id)));
      await audit({
        huntId: hunt.id,
        actorUserId: user.id,
        action: "task.update",
        targetKind: "task",
        targetId: existing.id,
        data: {
          code: values.code,
          title: values.title,
          changed,
          ...(changed.includes("points") ? { points: { from: existing.points, to: values.points } } : {}),
        },
      });
    } else {
      taskId = newId();
      const top = await db
        .select({ top: max(tasks.sortOrder) })
        .from(tasks)
        .where(eq(tasks.huntId, hunt.id))
        .get();
      await db.insert(tasks).values({ id: taskId, huntId: hunt.id, sortOrder: (top?.top ?? -1) + 1, ...values });
      await audit({
        huntId: hunt.id,
        actorUserId: user.id,
        action: "task.create",
        targetKind: "task",
        targetId: taskId,
        data: { code: values.code, title: values.title, kind: values.kind },
      });
    }
  } catch (err) {
    if (isUniqueViolation(err, "tasks.hunt_id, tasks.code")) {
      return fail("That code was just taken.", { code: "Someone else just used this code. Pick another one." });
    }
    if (isUniqueViolation(err, "tasks.checkpoint_code")) {
      return fail("That checkpoint code was just taken.", { checkpointCode: "Generate a new code." });
    }
    throw err;
  }

  publish(hunt.id, { type: "tasks.changed" });
  publish(hunt.id, { type: "scores.changed" });
  revalidateHunt(hunt.id);
  redirect(`/manage/${hunt.id}/tasks?saved=${taskId}&did=${existing ? "updated" : "created"}`);
}

// ---------------------------------------------------------------------------
// Delete, duplicate, reorder
// ---------------------------------------------------------------------------

const TaskRef = z.object({ huntId: zId, taskId: zId });

async function loadTask(hunt: Hunt, taskId: string) {
  return (
    (await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.huntId, hunt.id)))
      .get()) ?? null
  );
}

export async function deleteTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(TaskRef, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  const archived = archivedError(hunt);
  if (archived) return archived;
  const task = await loadTask(hunt, parsed.data.taskId);
  if (!task) redirect(`/manage/${hunt.id}/tasks`);

  const subs = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.huntId, hunt.id), eq(submissions.taskId, task.id)));
  const toDelete = [
    ...(await ownedFiles(hunt.id, "task", [task.id])),
    ...(await ownedFiles(
      hunt.id,
      "submission",
      subs.map((s) => s.id),
    )),
  ];
  // Submissions, hints and hint reveals go with the task (foreign-key cascade).
  await db.delete(tasks).where(and(eq(tasks.id, task.id), eq(tasks.huntId, hunt.id)));
  await deleteFiles(toDelete);
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "task.delete",
    targetKind: "task",
    targetId: task.id,
    data: { code: task.code, title: task.title, submissions: subs.length },
  });
  publish(hunt.id, { type: "tasks.changed" });
  publish(hunt.id, { type: "scores.changed" });
  revalidateHunt(hunt.id);
  // The list reads the title back from the audit entry, so the notice can't be spoofed by a crafted link.
  redirect(`/manage/${hunt.id}/tasks?deleted=${task.id}`);
}

export async function duplicateTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(TaskRef, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  const archived = archivedError(hunt);
  if (archived) return archived;
  const task = await loadTask(hunt, parsed.data.taskId);
  if (!task) return fail("This task no longer exists. Someone may have deleted it.");

  const id = newId();
  // Published hunts hide the copy until it's ready, so players never see a half-edited task.
  const hidden = hunt.status === "published" ? true : task.hidden;
  const taskHints = await db
    .select()
    .from(hints)
    .where(and(eq(hints.huntId, hunt.id), eq(hints.taskId, task.id)))
    .orderBy(asc(hints.sortOrder));
  const now = new Date();
  let code = 0;
  for (let attempt = 0; ; attempt += 1) {
    code = await nextTaskCode(hunt.id);
    const checkpointCode = task.kind === "checkpoint" ? await uniqueCheckpointCode(hunt.id) : null;
    try {
      await runBatch([
        db
          .update(tasks)
          .set({ sortOrder: sql`${tasks.sortOrder} + 1` })
          .where(and(eq(tasks.huntId, hunt.id), gt(tasks.sortOrder, task.sortOrder))),
        db.insert(tasks).values({
          ...task,
          id,
          code,
          title: `${task.title} (copy)`.slice(0, 80),
          checkpointCode,
          hidden,
          sortOrder: task.sortOrder + 1,
          createdAt: now,
          updatedAt: now,
        }),
        ...(taskHints.length > 0
          ? [db.insert(hints).values(taskHints.map((h) => ({ ...h, id: newId(), taskId: id, createdAt: now })))]
          : []),
      ]);
      break;
    } catch (err) {
      // Another organizer took the code at the same moment: take the next one.
      if (isUniqueViolation(err) && attempt < 3) continue;
      throw err;
    }
  }
  const attachments = await ownedFiles(hunt.id, "task", [task.id]);
  if (attachments.length > 0) await copyFiles(attachments, { huntId: hunt.id, ownerKind: "task", ownerId: id });

  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "task.duplicate",
    targetKind: "task",
    targetId: id,
    data: { from: task.id, code, title: task.title },
  });
  publish(hunt.id, { type: "tasks.changed" });
  revalidateHunt(hunt.id);
  redirect(`/manage/${hunt.id}/tasks/${id}?copied=${hidden && !task.hidden ? "hidden" : "1"}`);
}

const MoveSchema = z.object({ huntId: zId, taskId: zId, direction: z.enum(["up", "down"]) });

/** Swaps a task with its neighbour in the list (and renumbers the list so ties can't stick). */
export async function moveTaskAction(input: { huntId: string; taskId: string; direction: "up" | "down" }) {
  const parsed = MoveSchema.safeParse(input);
  if (!parsed.success) return fail("This page is out of date. Reload it and try again.");
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  const archived = archivedError(hunt);
  if (archived) return archived;
  const list = await db
    .select({ id: tasks.id, sortOrder: tasks.sortOrder, code: tasks.code })
    .from(tasks)
    .where(eq(tasks.huntId, hunt.id))
    .orderBy(asc(tasks.sortOrder), asc(tasks.code));
  const from = list.findIndex((t) => t.id === parsed.data.taskId);
  if (from < 0) return fail("This task no longer exists. Reload the page.");
  const to = parsed.data.direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= list.length) return ok();
  const order = list.map((t) => t.id);
  [order[from], order[to]] = [order[to], order[from]];
  await runBatch(
    order
      .map((id, i) => ({ id, i, before: list.find((t) => t.id === id)?.sortOrder }))
      .filter((r) => r.before !== r.i)
      .map((r) =>
        db
          .update(tasks)
          .set({ sortOrder: r.i })
          .where(and(eq(tasks.id, r.id), eq(tasks.huntId, hunt.id))),
      ),
  );
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "task.reorder",
    targetKind: "task",
    targetId: parsed.data.taskId,
    data: { direction: parsed.data.direction },
  });
  publish(hunt.id, { type: "tasks.changed" });
  revalidateHunt(hunt.id);
  return ok();
}

// ---------------------------------------------------------------------------
// Hints
// ---------------------------------------------------------------------------

const HintFields = {
  body: zText("the hint", { max: 500 }),
  cost: zNumber("the cost", { min: 0, max: 10_000 }),
};

const AddHintSchema = z.object({ huntId: zId, taskId: zId, ...HintFields });

export async function addHintAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(AddHintSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const { user, hunt } = await requireStaff(d.huntId, "organizer");
  const archived = archivedError(hunt);
  if (archived) return archived;
  const task = await loadTask(hunt, d.taskId);
  if (!task) return fail("This task no longer exists. Reload the page.");
  const top = await db
    .select({ top: max(hints.sortOrder), n: count() })
    .from(hints)
    .where(and(eq(hints.huntId, hunt.id), eq(hints.taskId, task.id)))
    .get();
  if ((top?.n ?? 0) >= 10) return fail("A task can have up to 10 hints.");
  const id = newId();
  await db
    .insert(hints)
    .values({ id, huntId: hunt.id, taskId: task.id, body: d.body, cost: d.cost, sortOrder: (top?.top ?? -1) + 1 });
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "hint.create",
    targetKind: "hint",
    targetId: id,
    data: { taskId: task.id, cost: d.cost },
  });
  publish(hunt.id, { type: "tasks.changed" });
  revalidateHunt(hunt.id);
  return ok("Hint added.");
}

const UpdateHintSchema = z.object({ huntId: zId, hintId: zId, ...HintFields });

export async function updateHintAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(UpdateHintSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const { user, hunt } = await requireStaff(d.huntId, "organizer");
  const archived = archivedError(hunt);
  if (archived) return archived;
  const hint = await db
    .select()
    .from(hints)
    .where(and(eq(hints.id, d.hintId), eq(hints.huntId, hunt.id)))
    .get();
  if (!hint) return fail("This hint no longer exists. Reload the page.");
  await db
    .update(hints)
    .set({ body: d.body, cost: d.cost })
    .where(and(eq(hints.id, hint.id), eq(hints.huntId, hunt.id)));
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "hint.update",
    targetKind: "hint",
    targetId: hint.id,
    data: { taskId: hint.taskId, cost: { from: hint.cost, to: d.cost } },
  });
  publish(hunt.id, { type: "tasks.changed" });
  revalidateHunt(hunt.id);
  return ok("Hint saved.");
}

const HintRef = z.object({ huntId: zId, hintId: zId });

export async function deleteHintAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(HintRef, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  const archived = archivedError(hunt);
  if (archived) return archived;
  const hint = await db
    .select()
    .from(hints)
    .where(and(eq(hints.id, parsed.data.hintId), eq(hints.huntId, hunt.id)))
    .get();
  if (!hint) return ok("Hint deleted.");
  const reveals =
    (await db.select({ n: count() }).from(hintUnlocks).where(eq(hintUnlocks.hintId, hint.id)).get())?.n ?? 0;
  // Reveals cascade with the hint, which refunds their cost.
  await db.delete(hints).where(and(eq(hints.id, hint.id), eq(hints.huntId, hunt.id)));
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "hint.delete",
    targetKind: "hint",
    targetId: hint.id,
    data: { taskId: hint.taskId, reveals },
  });
  publish(hunt.id, { type: "tasks.changed" });
  if (reveals > 0) publish(hunt.id, { type: "scores.changed" });
  revalidateHunt(hunt.id);
  return ok(reveals > 0 ? "Hint deleted. Teams who revealed it got their points back." : "Hint deleted.");
}

const MoveHintSchema = z.object({ huntId: zId, hintId: zId, direction: z.enum(["up", "down"]) });

export async function moveHintAction(input: { huntId: string; hintId: string; direction: "up" | "down" }) {
  const parsed = MoveHintSchema.safeParse(input);
  if (!parsed.success) return fail("This page is out of date. Reload it and try again.");
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  const archived = archivedError(hunt);
  if (archived) return archived;
  const hint = await db
    .select()
    .from(hints)
    .where(and(eq(hints.id, parsed.data.hintId), eq(hints.huntId, hunt.id)))
    .get();
  if (!hint) return fail("This hint no longer exists. Reload the page.");
  const list = await db
    .select({ id: hints.id, sortOrder: hints.sortOrder })
    .from(hints)
    .where(and(eq(hints.huntId, hunt.id), eq(hints.taskId, hint.taskId)))
    .orderBy(asc(hints.sortOrder), asc(hints.createdAt));
  const from = list.findIndex((h) => h.id === hint.id);
  const to = parsed.data.direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= list.length) return ok();
  const order = list.map((h) => h.id);
  [order[from], order[to]] = [order[to], order[from]];
  await runBatch(
    order.map((id, i) =>
      db
        .update(hints)
        .set({ sortOrder: i })
        .where(and(eq(hints.id, id), eq(hints.huntId, hunt.id))),
    ),
  );
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "hint.reorder",
    targetKind: "hint",
    targetId: hint.id,
    data: { taskId: hint.taskId, direction: parsed.data.direction },
  });
  publish(hunt.id, { type: "tasks.changed" });
  revalidateHunt(hunt.id);
  return ok();
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const UploadSchema = z.object({ huntId: zId, taskId: zId, file: zOptFile });

export async function uploadAttachmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(UploadSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  const archived = archivedError(hunt);
  if (archived) return archived;
  const task = await loadTask(hunt, parsed.data.taskId);
  if (!task) return fail("This task no longer exists. Reload the page.");
  const file = parsed.data.file;
  if (!file) return fail("Choose a file first.", { file: "Choose a photo or a PDF." });
  const existing = await ownedFiles(hunt.id, "task", [task.id]);
  if (existing.length >= 8) return fail("A task can have up to 8 attachments. Delete one first.");
  try {
    const row = await storeUpload({
      file,
      name: file instanceof File ? file.name : null,
      huntId: hunt.id,
      ownerKind: "task",
      ownerId: task.id,
      allow: ["image", "document"],
      maxBytes: ATTACHMENT_MAX_BYTES,
      sortOrder: existing.length,
    });
    await audit({
      huntId: hunt.id,
      actorUserId: user.id,
      action: "task.attach",
      targetKind: "file",
      targetId: row.id,
      data: { taskId: task.id, name: row.originalName },
    });
  } catch (err) {
    if (err instanceof UploadError) {
      const message = err.message.replace("Upload a photo or document.", "Upload a photo or a PDF.");
      return fail(message, { file: message });
    }
    throw err;
  }
  publish(hunt.id, { type: "tasks.changed" });
  revalidateHunt(hunt.id);
  return ok("Attachment added.");
}

const FileRef = z.object({ huntId: zId, fileId: zId });

export async function deleteAttachmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(FileRef, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  const archived = archivedError(hunt);
  if (archived) return archived;
  const row = await db
    .select()
    .from(files)
    .where(and(eq(files.id, parsed.data.fileId), eq(files.huntId, hunt.id), eq(files.ownerKind, "task")))
    .get();
  if (!row) return ok("Attachment deleted.");
  await deleteFiles([row]);
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "task.detach",
    targetKind: "file",
    targetId: row.id,
    data: { taskId: row.ownerId, name: row.originalName },
  });
  publish(hunt.id, { type: "tasks.changed" });
  revalidateHunt(hunt.id);
  return ok("Attachment deleted.");
}
