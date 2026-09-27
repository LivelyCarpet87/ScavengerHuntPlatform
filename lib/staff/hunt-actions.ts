"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, fail, ok, parseForm, zCheckbox, zOptionalDate } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireStaff, requireUser } from "@/lib/auth/access";
import { db } from "@/lib/db";
import {
  ACCENTS,
  adjustments,
  files,
  GALLERY_MODES,
  type Hunt,
  type HuntStatus,
  hints,
  hintUnlocks,
  huntStaff,
  hunts,
  JOIN_MODES,
  SCOREBOARD_VISIBILITY,
  submissions,
  TEAM_CREATION,
  tasks,
} from "@/lib/db/schema";
import { formatCode, newCode, newId, slugify } from "@/lib/ids";
import { publish } from "@/lib/realtime/bus";
import { deleteFiles, deleteHuntStorage, storeUpload, UploadError } from "@/lib/storage";
import { FIRST_TASK_CODE, getTemplate, type HuntTemplate } from "@/lib/templates";
import { isValidTimeZone, revalidateHunt, runBatch } from "./batch";
import { freeSlug, isUniqueViolation, SLUG_PATTERN, slugTaken, uniqueJoinCode } from "./codes";
import { copyFiles, ownedFiles } from "./files";
import { parseLines } from "./text";
import { zId, zLongText, zOptFile, zOptNumber, zOptText, zText } from "./zod";

/*
 * Hunt-level organizer actions: create, duplicate, publish, settings
 * sections and the danger zone. Every action re-checks the caller's role.
 */

const DEFAULT_FEEDBACK = [
  "Great shot!",
  "We need the whole team in the photo.",
  "That’s not the right spot. Have another look.",
  "Too blurry to judge. Can you retake it?",
];

const zName = zText("the hunt name", { min: 2, max: 80 });
const zSlug = z
  .string({ message: "Enter a link for the hunt." })
  .trim()
  .toLowerCase()
  .min(3, "Use at least 3 characters for the link.")
  .max(48, "Keep the link to 48 characters or fewer.")
  .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single dashes, like campus-hunt-2026.");

const HuntOnly = z.object({ huntId: zId });

/**
 * Field errors for a link that's already used, with a free alternative under
 * "slug.suggestion" so the form can offer it as a one-tap fix.
 */
async function slugTakenFields(slug: string, exceptHuntId?: string): Promise<Record<string, string>> {
  const suggestion = await freeSlug(slug, exceptHuntId);
  return { slug: `Another hunt already uses this link. Try “${suggestion}”.`, "slug.suggestion": suggestion };
}

export type SlugCheck =
  | { status: "free"; slug: string }
  | { status: "taken"; slug: string; suggestion: string }
  | { status: "invalid"; slug: string; message: string };

/**
 * Live availability check for the link field (new hunt and settings), so
 * organizers hear about a taken link while typing, not after submitting.
 * Pass `huntId` when editing an existing hunt so its own link counts as free.
 */
export async function checkSlugAction(input: { slug: string; huntId?: string }): Promise<SlugCheck> {
  await requireUser("/dashboard");
  const raw = typeof input?.slug === "string" ? input.slug.slice(0, 100) : "";
  const parsed = zSlug.safeParse(raw);
  if (!parsed.success) {
    return { status: "invalid", slug: raw, message: parsed.error.issues[0]?.message ?? "Check the link." };
  }
  const exceptHuntId =
    typeof input.huntId === "string" && input.huntId
      ? (await requireStaff(input.huntId.slice(0, 64), "organizer")).hunt.id
      : undefined;
  if (!(await slugTaken(parsed.data, exceptHuntId))) return { status: "free", slug: parsed.data };
  return { status: "taken", slug: parsed.data, suggestion: await freeSlug(parsed.data, exceptHuntId) };
}

type TaskInsert = typeof tasks.$inferInsert;
type HintInsert = typeof hints.$inferInsert;

function templateRows(huntId: string, template: HuntTemplate): { taskRows: TaskInsert[]; hintRows: HintInsert[] } {
  const taskRows: TaskInsert[] = [];
  const hintRows: HintInsert[] = [];
  const checkpointCodes = new Set<string>();
  template.tasks.forEach((t, i) => {
    const id = newId();
    let checkpointCode: string | null = null;
    if (t.kind === "checkpoint") {
      do checkpointCode = newCode(6);
      while (checkpointCodes.has(checkpointCode));
      checkpointCodes.add(checkpointCode);
    }
    taskRows.push({
      id,
      huntId,
      code: FIRST_TASK_CODE + i,
      title: t.title,
      description: t.description,
      kind: t.kind,
      category: t.category,
      points: t.points,
      scoring: t.kind === "contest" ? "fixed" : (t.scoring ?? "fixed"),
      minPoints: t.minPoints ?? 0,
      decaySolves: t.decaySolves ?? 10,
      mediaAccept: t.mediaAccept ?? "photo",
      autoApprove: t.autoApprove ?? false,
      answers: t.answers ?? [],
      answerMatch: t.answerMatch ?? "loose",
      maxAttempts: t.maxAttempts ?? null,
      contestRank: t.contestRank ?? "highest",
      contestPlaces: t.contestPlaces ?? 3,
      contestUnit: t.contestUnit ?? null,
      checkpointCode,
      sortOrder: i,
    });
    (t.hints ?? []).forEach((h, j) => {
      hintRows.push({ huntId, taskId: id, body: h.body, cost: h.cost, sortOrder: j });
    });
  });
  return { taskRows, hintRows };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const CreateSchema = z
  .object({
    name: zName,
    slug: zSlug,
    startsAt: zOptionalDate,
    endsAt: zOptionalDate,
    template: z.string().max(40).default("blank"),
    accent: z.enum(ACCENTS, { message: "Pick one of the map colors." }).default("overprint"),
    timezone: z.string().max(64).optional(),
    /** Generated when the form was rendered, so a retried submit can't create the hunt twice. */
    huntId: z
      .string()
      .regex(/^[0-9A-Za-z]{16}$/)
      .optional()
      .catch(undefined),
  })
  .refine((d) => !d.startsAt || !d.endsAt || d.endsAt > d.startsAt, {
    message: "The end has to be after the start.",
    path: ["endsAt"],
  });

export async function createHuntAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/dashboard/new");
  const parsed = parseForm(CreateSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;

  let huntId = d.huntId ?? newId();
  const already = await db
    .select({ id: hunts.id, createdBy: hunts.createdBy })
    .from(hunts)
    .where(eq(hunts.id, huntId))
    .get();
  if (already) {
    // The same form submitted twice (double tap, flaky network): open the hunt it created.
    if (already.createdBy === user.id) redirect(`/manage/${already.id}?created=1`);
    huntId = newId();
  }

  const template = d.template === "blank" ? null : getTemplate(d.template);
  if (d.template !== "blank" && !template) {
    return fail("That template isn’t available. Pick another starting point.", { template: "Pick a starting point." });
  }
  const slugTakenError = async () => fail("That link is taken.", await slugTakenFields(d.slug));
  if (await slugTaken(d.slug)) return slugTakenError();

  const { taskRows, hintRows } = template ? templateRows(huntId, template) : { taskRows: [], hintRows: [] };
  let joinCode = await uniqueJoinCode();
  for (let attempt = 0; ; attempt += 1) {
    try {
      await runBatch([
        db.insert(hunts).values({
          id: huntId,
          slug: d.slug,
          name: d.name,
          status: "draft",
          startsAt: d.startsAt,
          endsAt: d.endsAt,
          timezone: d.timezone && isValidTimeZone(d.timezone) ? d.timezone : "UTC",
          joinCode,
          accent: d.accent,
          tagline: template?.tagline ?? null,
          description: template?.description ?? "",
          maxTeamSize: template?.maxTeamSize ?? null,
          galleryMode: template?.galleryMode ?? "after",
          feedbackTemplates: template?.feedbackTemplates ?? DEFAULT_FEEDBACK,
          createdBy: user.id,
        }),
        db.insert(huntStaff).values({ huntId, userId: user.id, role: "owner" }),
        ...(taskRows.length > 0 ? [db.insert(tasks).values(taskRows)] : []),
        ...(hintRows.length > 0 ? [db.insert(hints).values(hintRows)] : []),
      ]);
      break;
    } catch (err) {
      if (isUniqueViolation(err, "hunts.join_code") && attempt < 3) {
        joinCode = await uniqueJoinCode();
        continue;
      }
      if (isUniqueViolation(err, "hunts.slug")) return slugTakenError();
      // A simultaneous duplicate submit created it first.
      if (isUniqueViolation(err, "hunts.id")) redirect(`/manage/${huntId}?created=1`);
      throw err;
    }
  }

  await audit({
    huntId,
    actorUserId: user.id,
    action: "hunt.create",
    targetKind: "hunt",
    targetId: huntId,
    data: { template: template?.id ?? null, tasks: taskRows.length },
  });
  revalidatePath("/dashboard");
  redirect(`/manage/${huntId}?created=1`);
}

// ---------------------------------------------------------------------------
// Duplicate
// ---------------------------------------------------------------------------

export async function duplicateHuntAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(HuntOnly, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");

  const [srcTasks, srcHints] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.huntId, hunt.id)),
    db.select().from(hints).where(eq(hints.huntId, hunt.id)),
  ]);
  const newHuntId = newId();
  const now = new Date();
  const taskIds = new Map(srcTasks.map((t) => [t.id, newId()]));
  const checkpointCodes = new Set<string>();
  const taskRows: TaskInsert[] = srcTasks.map((t) => {
    let checkpointCode: string | null = null;
    if (t.kind === "checkpoint") {
      do checkpointCode = newCode(6);
      while (checkpointCodes.has(checkpointCode));
      checkpointCodes.add(checkpointCode);
    }
    return {
      ...t,
      id: taskIds.get(t.id) as string,
      huntId: newHuntId,
      checkpointCode,
      // Unlock and close times belong to the old schedule.
      unlockAt: null,
      lockAt: null,
      createdAt: now,
      updatedAt: now,
    };
  });
  const hintRows: HintInsert[] = srcHints
    .filter((h) => taskIds.has(h.taskId))
    .map((h) => ({ ...h, id: newId(), huntId: newHuntId, taskId: taskIds.get(h.taskId) as string, createdAt: now }));

  const name = `Copy of ${hunt.name}`.slice(0, 80);
  let slug = await freeSlug(slugify(`${hunt.slug}-copy`));
  let joinCode = await uniqueJoinCode();
  for (let attempt = 0; ; attempt += 1) {
    try {
      await runBatch([
        db.insert(hunts).values({
          id: newHuntId,
          slug,
          name,
          tagline: hunt.tagline,
          description: hunt.description,
          status: "draft",
          startsAt: null,
          endsAt: null,
          freezeAt: null,
          timezone: hunt.timezone,
          joinCode,
          joinMode: hunt.joinMode,
          teamCreation: hunt.teamCreation,
          registrationOpen: hunt.registrationOpen,
          maxTeamSize: hunt.maxTeamSize,
          scoreboardVisibility: hunt.scoreboardVisibility,
          galleryMode: hunt.galleryMode,
          accent: hunt.accent,
          feedbackTemplates: hunt.feedbackTemplates,
          createdBy: user.id,
        }),
        db.insert(huntStaff).values({ huntId: newHuntId, userId: user.id, role: "owner" }),
        ...(taskRows.length > 0 ? [db.insert(tasks).values(taskRows)] : []),
        ...(hintRows.length > 0 ? [db.insert(hints).values(hintRows)] : []),
      ]);
      break;
    } catch (err) {
      // Someone took the link or the code in the meantime: pick fresh ones and retry.
      if (isUniqueViolation(err, "hunts.slug") && attempt < 3) {
        slug = await freeSlug(slugify(`${hunt.slug}-copy`));
        continue;
      }
      if (isUniqueViolation(err, "hunts.join_code") && attempt < 3) {
        joinCode = await uniqueJoinCode();
        continue;
      }
      throw err;
    }
  }

  // Task attachments and the cover image come along (bytes are copied).
  const attachments = await ownedFiles(hunt.id, "task", [...taskIds.keys()]);
  for (const [oldId, newTaskId] of taskIds) {
    const own = attachments.filter((f) => f.ownerId === oldId);
    if (own.length > 0) await copyFiles(own, { huntId: newHuntId, ownerKind: "task", ownerId: newTaskId });
  }
  if (hunt.coverFileId) {
    const cover = (await ownedFiles(hunt.id, "hunt", [hunt.id])).find((f) => f.id === hunt.coverFileId);
    if (cover) {
      const [copy] = await copyFiles([cover], { huntId: newHuntId, ownerKind: "hunt", ownerId: newHuntId });
      if (copy) await db.update(hunts).set({ coverFileId: copy.id }).where(eq(hunts.id, newHuntId));
    }
  }

  await audit({
    huntId: newHuntId,
    actorUserId: user.id,
    action: "hunt.duplicate",
    targetKind: "hunt",
    targetId: newHuntId,
    data: { fromHuntId: hunt.id, fromName: hunt.name, tasks: taskRows.length },
  });
  revalidatePath("/dashboard");
  redirect(`/manage/${newHuntId}?created=copy`);
}

// ---------------------------------------------------------------------------
// Status: publish, unpublish, archive, restore
// ---------------------------------------------------------------------------

async function changeStatus(hunt: Hunt, userId: string, status: HuntStatus): Promise<ActionState> {
  if (hunt.status === status) {
    return ok(status === "published" ? "The hunt is already published." : "Nothing to change.");
  }
  if (status === "published" && hunt.status === "draft") {
    const n = (await db.select({ n: count() }).from(tasks).where(eq(tasks.huntId, hunt.id)).get())?.n ?? 0;
    if (n === 0) return fail("Add at least one task before publishing, so players don’t arrive at an empty hunt.");
    if (hunt.endsAt && hunt.endsAt.getTime() <= Date.now()) {
      return fail("The end time has already passed. Set a new schedule before publishing.");
    }
  }
  await db.update(hunts).set({ status }).where(eq(hunts.id, hunt.id));
  const action =
    status === "published"
      ? hunt.status === "archived"
        ? "hunt.restore"
        : "hunt.publish"
      : status === "draft"
        ? "hunt.unpublish"
        : "hunt.archive";
  await audit({
    huntId: hunt.id,
    actorUserId: userId,
    action,
    targetKind: "hunt",
    targetId: hunt.id,
    data: { from: hunt.status },
  });
  publish(hunt.id, { type: "hunt.changed" });
  revalidateHunt(hunt.id);
  switch (action) {
    case "hunt.publish":
      return ok("Published. Teams can now find the hunt with its code.");
    case "hunt.restore":
      return ok("Restored. The hunt is back on the dashboard.");
    case "hunt.unpublish":
      return ok("Back to draft. Players can’t open the hunt until you publish it again.");
    default:
      return ok("Archived. Results stay available, and nothing more can be submitted.");
  }
}

export async function publishHuntAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(HuntOnly, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  return changeStatus(hunt, user.id, "published");
}

const StatusSchema = z.object({
  huntId: zId,
  status: z.enum(["draft", "published", "archived"], { message: "Pick a status." }),
});

export async function setHuntStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(StatusSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  return changeStatus(hunt, user.id, parsed.data.status);
}

// ---------------------------------------------------------------------------
// Settings: basics, cover, schedule, registration, visibility, judging
// ---------------------------------------------------------------------------

const BasicsSchema = z.object({
  huntId: zId,
  name: zName,
  slug: zSlug,
  tagline: zOptText("the tagline", 140),
  description: zLongText("the introduction", 10_000),
  accent: z.enum(ACCENTS, { message: "Pick one of the map colors." }),
});

export async function updateBasicsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(BasicsSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const { user, hunt } = await requireStaff(d.huntId, "organizer");
  if (d.slug !== hunt.slug && (await slugTaken(d.slug, hunt.id))) {
    return fail("That link is taken.", await slugTakenFields(d.slug, hunt.id));
  }
  try {
    await db
      .update(hunts)
      .set({ name: d.name, slug: d.slug, tagline: d.tagline, description: d.description, accent: d.accent })
      .where(eq(hunts.id, hunt.id));
  } catch (err) {
    if (isUniqueViolation(err, "hunts.slug"))
      return fail("That link is taken.", await slugTakenFields(d.slug, hunt.id));
    throw err;
  }
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "hunt.update",
    targetKind: "hunt",
    targetId: hunt.id,
    data: { section: "basics", ...(d.slug !== hunt.slug ? { slug: { from: hunt.slug, to: d.slug } } : {}) },
  });
  publish(hunt.id, { type: "hunt.changed" });
  revalidateHunt(hunt.id);
  return ok(d.slug !== hunt.slug ? "Saved. Share the new link: the old one no longer works." : "Saved.");
}

const COVER_MAX_BYTES = 8 * 1024 * 1024;

const CoverSchema = z.object({ huntId: zId, cover: zOptFile });

export async function uploadCoverAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(CoverSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  const file = parsed.data.cover;
  if (!file) return fail("Choose an image first.", { cover: "Choose an image first." });
  let row: Awaited<ReturnType<typeof storeUpload>>;
  try {
    row = await storeUpload({
      file,
      name: file instanceof File ? file.name : null,
      huntId: hunt.id,
      ownerKind: "hunt",
      ownerId: hunt.id,
      allow: ["image"],
      maxBytes: COVER_MAX_BYTES,
    });
  } catch (err) {
    if (err instanceof UploadError) return fail(err.message, { cover: err.message });
    throw err;
  }
  const old = hunt.coverFileId ? await ownedFiles(hunt.id, "hunt", [hunt.id]) : [];
  await db.update(hunts).set({ coverFileId: row.id }).where(eq(hunts.id, hunt.id));
  await deleteFiles(old.filter((f) => f.id !== row.id));
  await audit({ huntId: hunt.id, actorUserId: user.id, action: "hunt.cover", targetKind: "file", targetId: row.id });
  publish(hunt.id, { type: "hunt.changed" });
  revalidateHunt(hunt.id);
  return ok("Cover image updated.");
}

export async function removeCoverAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(HuntOnly, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  const old = await ownedFiles(hunt.id, "hunt", [hunt.id]);
  await db.update(hunts).set({ coverFileId: null }).where(eq(hunts.id, hunt.id));
  await deleteFiles(old);
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "hunt.cover_remove",
    targetKind: "hunt",
    targetId: hunt.id,
  });
  publish(hunt.id, { type: "hunt.changed" });
  revalidateHunt(hunt.id);
  return ok("Cover image removed.");
}

const ScheduleSchema = z
  .object({
    huntId: zId,
    startsAt: zOptionalDate,
    endsAt: zOptionalDate,
    freezeAt: zOptionalDate,
    /** IANA zone for times the hunt prints (posters, notifications). Absent keeps the current one. */
    timezone: z
      .string()
      .max(64)
      .optional()
      .refine((zone) => !zone || isValidTimeZone(zone), "Pick a time zone from the list."),
  })
  .superRefine((d, ctx) => {
    if (d.startsAt && d.endsAt && d.endsAt <= d.startsAt) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end has to be after the start." });
    }
    if (d.freezeAt && d.endsAt && d.freezeAt >= d.endsAt) {
      ctx.addIssue({ code: "custom", path: ["freezeAt"], message: "Freeze the scoreboard before the hunt ends." });
    }
    if (d.freezeAt && d.startsAt && d.freezeAt <= d.startsAt) {
      ctx.addIssue({ code: "custom", path: ["freezeAt"], message: "Freeze the scoreboard after the hunt starts." });
    }
  });

export async function updateScheduleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(ScheduleSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const { user, hunt } = await requireStaff(d.huntId, "organizer");
  const timezone = d.timezone || hunt.timezone;
  await db
    .update(hunts)
    .set({ startsAt: d.startsAt, endsAt: d.endsAt, freezeAt: d.freezeAt, timezone })
    .where(eq(hunts.id, hunt.id));
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "hunt.schedule",
    targetKind: "hunt",
    targetId: hunt.id,
    data: {
      startsAt: d.startsAt?.toISOString() ?? null,
      endsAt: d.endsAt?.toISOString() ?? null,
      freezeAt: d.freezeAt?.toISOString() ?? null,
      ...(timezone !== hunt.timezone ? { timezone: { from: hunt.timezone, to: timezone } } : {}),
    },
  });
  publish(hunt.id, { type: "hunt.changed" });
  publish(hunt.id, { type: "scores.changed" });
  revalidateHunt(hunt.id);
  return ok("Schedule saved.");
}

const RegistrationSchema = z.object({
  huntId: zId,
  joinMode: z.enum(JOIN_MODES, { message: "Choose how players join." }),
  teamCreation: z.enum(TEAM_CREATION, { message: "Choose who creates teams." }),
  registrationOpen: zCheckbox,
  maxTeamSize: zOptNumber("the team size", { min: 1, max: 50 }),
});

export async function updateRegistrationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(RegistrationSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const { user, hunt } = await requireStaff(d.huntId, "organizer");
  await db
    .update(hunts)
    .set({
      joinMode: d.joinMode,
      teamCreation: d.teamCreation,
      registrationOpen: d.registrationOpen,
      maxTeamSize: d.maxTeamSize,
    })
    .where(eq(hunts.id, hunt.id));
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "hunt.registration",
    targetKind: "hunt",
    targetId: hunt.id,
    data: { ...d, huntId: undefined },
  });
  publish(hunt.id, { type: "hunt.changed" });
  revalidateHunt(hunt.id);
  return ok("Registration settings saved.");
}

export async function regenerateJoinCodeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(HuntOnly, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  let code = await uniqueJoinCode();
  for (let attempt = 0; ; attempt += 1) {
    try {
      await db.update(hunts).set({ joinCode: code }).where(eq(hunts.id, hunt.id));
      break;
    } catch (err) {
      if (isUniqueViolation(err, "hunts.join_code") && attempt < 3) {
        code = await uniqueJoinCode();
        continue;
      }
      throw err;
    }
  }
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "hunt.join_code",
    targetKind: "hunt",
    targetId: hunt.id,
    data: { from: hunt.joinCode, to: code },
  });
  publish(hunt.id, { type: "hunt.changed" });
  revalidateHunt(hunt.id);
  return ok(`New hunt code: ${formatJoinCode(code)}. Reprint the join poster; the old code no longer works.`);
}

function formatJoinCode(code: string) {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : formatCode(code);
}

const VisibilitySchema = z.object({
  huntId: zId,
  scoreboardVisibility: z.enum(SCOREBOARD_VISIBILITY, { message: "Choose who sees the scoreboard." }),
  galleryMode: z.enum(GALLERY_MODES, { message: "Choose when the gallery opens." }),
});

export async function updateVisibilityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(VisibilitySchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const { user, hunt } = await requireStaff(d.huntId, "organizer");
  await db
    .update(hunts)
    .set({ scoreboardVisibility: d.scoreboardVisibility, galleryMode: d.galleryMode })
    .where(eq(hunts.id, hunt.id));
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "hunt.visibility",
    targetKind: "hunt",
    targetId: hunt.id,
    data: { scoreboardVisibility: d.scoreboardVisibility, galleryMode: d.galleryMode },
  });
  publish(hunt.id, { type: "hunt.changed" });
  publish(hunt.id, { type: "scores.changed" });
  revalidateHunt(hunt.id);
  return ok("Scoreboard and gallery settings saved.");
}

const FEEDBACK_MAX = 12;
const FEEDBACK_LENGTH = 160;

const FeedbackSchema = z.object({ huntId: zId, feedbackTemplates: zLongText("feedback", 4000) });

export async function updateFeedbackTemplatesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(FeedbackSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  const lines = parseLines(parsed.data.feedbackTemplates);
  const tooLong = lines.findIndex((l) => l.length > FEEDBACK_LENGTH);
  if (tooLong >= 0) {
    const message = `Line ${tooLong + 1} is too long. Keep each message to ${FEEDBACK_LENGTH} characters.`;
    return fail(message, { feedbackTemplates: message });
  }
  if (lines.length > FEEDBACK_MAX) {
    const message = `Keep it to ${FEEDBACK_MAX} messages so they fit as buttons.`;
    return fail(message, { feedbackTemplates: message });
  }
  await db.update(hunts).set({ feedbackTemplates: lines }).where(eq(hunts.id, hunt.id));
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "hunt.feedback_templates",
    targetKind: "hunt",
    targetId: hunt.id,
    data: { count: lines.length },
  });
  publish(hunt.id, { type: "hunt.changed" });
  revalidateHunt(hunt.id);
  return ok(lines.length > 0 ? "Feedback messages saved." : "Feedback messages cleared.");
}

// ---------------------------------------------------------------------------
// Danger zone (owners)
// ---------------------------------------------------------------------------

const ConfirmSchema = z.object({ huntId: zId, confirmName: z.string().default("") });

function nameMatches(typed: string, name: string) {
  return typed.trim().replace(/\s+/g, " ") === name.trim().replace(/\s+/g, " ");
}

export async function resetHuntAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(ConfirmSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "owner");
  if (!nameMatches(parsed.data.confirmName, hunt.name)) {
    return fail("Type the hunt’s name exactly to confirm.", { confirmName: `Type “${hunt.name}” to confirm.` });
  }
  const subFiles = await db
    .select()
    .from(files)
    .where(and(eq(files.huntId, hunt.id), eq(files.ownerKind, "submission")));
  const counts = await Promise.all([
    db.select({ n: count() }).from(submissions).where(eq(submissions.huntId, hunt.id)).get(),
    db.select({ n: count() }).from(hintUnlocks).where(eq(hintUnlocks.huntId, hunt.id)).get(),
    db.select({ n: count() }).from(adjustments).where(eq(adjustments.huntId, hunt.id)).get(),
  ]);
  await runBatch([
    db.delete(submissions).where(eq(submissions.huntId, hunt.id)),
    db.delete(hintUnlocks).where(eq(hintUnlocks.huntId, hunt.id)),
    db.delete(adjustments).where(eq(adjustments.huntId, hunt.id)),
  ]);
  await deleteFiles(subFiles);
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "hunt.reset",
    targetKind: "hunt",
    targetId: hunt.id,
    data: {
      submissions: counts[0]?.n ?? 0,
      hintReveals: counts[1]?.n ?? 0,
      adjustments: counts[2]?.n ?? 0,
      files: subFiles.length,
    },
  });
  publish(hunt.id, { type: "scores.changed" });
  publish(hunt.id, { type: "hunt.changed" });
  revalidateHunt(hunt.id);
  return ok("Reset. Every team is back to zero; teams, players and tasks are unchanged.");
}

export async function deleteHuntAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(ConfirmSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "owner");
  if (!nameMatches(parsed.data.confirmName, hunt.name)) {
    return fail("Type the hunt’s name exactly to confirm.", { confirmName: `Type “${hunt.name}” to confirm.` });
  }
  await db.delete(hunts).where(eq(hunts.id, hunt.id));
  await deleteHuntStorage(hunt.id);
  // The hunt's own audit rows go with it, so record this one at platform level.
  await audit({
    huntId: null,
    actorUserId: user.id,
    action: "hunt.delete",
    targetKind: "hunt",
    targetId: hunt.id,
    data: { name: hunt.name, slug: hunt.slug },
  });
  publish(hunt.id, { type: "hunt.changed" });
  revalidatePath("/dashboard");
  // The dashboard reads the name back from the audit entry, so the notice can't be spoofed by a crafted link.
  redirect(`/dashboard?deleted=${hunt.id}`);
}

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

const PrintSchema = z.object({ huntId: zId, what: z.enum(["checkpoints", "poster", "team_cards"]) });

/** Recorded when a print page is printed, so the setup checklist can tick "Print checkpoint posters". */
export async function recordPrintAction(input: { huntId: string; what: string }): Promise<ActionState> {
  const parsed = PrintSchema.safeParse(input);
  if (!parsed.success) return fail("Unknown print page.");
  const { user, hunt } = await requireStaff(
    parsed.data.huntId,
    parsed.data.what === "checkpoints" ? "organizer" : "judge",
  );
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: `print.${parsed.data.what}`,
    targetKind: "hunt",
    targetId: hunt.id,
  });
  if (parsed.data.what === "checkpoints") revalidatePath(`/manage/${hunt.id}`);
  return ok();
}
