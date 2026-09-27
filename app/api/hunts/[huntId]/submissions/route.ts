import type { NextRequest } from "next/server";
import { z } from "zod";
import { getPlayer } from "@/lib/auth/access";
import { env } from "@/lib/env";
import { getHuntById } from "@/lib/hunts";
import { MAX_FILES, type SubmitFailureCode, type SubmitFile, submitProof } from "@/lib/player/submit";

/*
 * POST /api/hunts/[huntId]/submissions — a team sends proof for a task.
 * Contract (docs/ARCHITECTURE.md): multipart/form-data with taskId, clientId,
 * text?, files (0–4), poster?, lat?, lng?, accuracy?, plus from the upload
 * queue: queuedFor? (ms the proof waited on the phone for signal) and teamId?
 * (the team it was made for). The team comes from the session cookie. Used by
 * the task page (XMLHttpRequest, for upload progress) and by the offline queue
 * (pages and the service worker).
 *
 *   200 { ok: true, duplicate?, submission: { id, status, feedback, points }, attemptsLeft, task }
 *   4xx { ok: false, error, code?, retryable: false }  — don't retry as-is; `code` (SubmitFailureCode):
 *         "already_completed" — the team already has this task, so there's nothing to send
 *         "team_changed"      — the phone is on another team now; this can't be sent
 *   429 { ok: false, error, retryable: true }          — retry later (Retry-After)
 *   5xx                                                — retry later
 */

// Four files at the per-file limit, plus room for the poster frame and form fields.
const MAX_BODY_BYTES = MAX_FILES * env.maxUploadBytes + 6 * 1024 * 1024;

function reply(status: number, body: Record<string, unknown>, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function refuse(status: number, error: string, headers?: HeadersInit, code?: SubmitFailureCode): Response {
  return reply(
    status,
    { ok: false, error, ...(code ? { code } : {}), retryable: status === 429 || status >= 500 },
    headers,
  );
}

/** Uploads must come from pages of this site (or its service worker). */
function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") === "same-origin";
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = new Set<string>();
  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwarded) hosts.add(forwarded);
  const host = req.headers.get("host");
  if (host) hosts.add(host);
  if (env.appUrl) hosts.add(new URL(env.appUrl).host);
  return hosts.has(originHost);
}

class BodyTooLarge extends Error {}

/** Parses multipart form data, giving up as soon as the body passes `limit` bytes. */
async function readForm(req: NextRequest, limit: number): Promise<FormData> {
  if (!req.body) throw new Error("No body");
  let seen = 0;
  const limited = req.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > limit) controller.error(new BodyTooLarge());
        else controller.enqueue(chunk);
      },
    }),
  );
  try {
    return await new Response(limited, {
      headers: { "content-type": req.headers.get("content-type") ?? "" },
    }).formData();
  } catch (err) {
    if (seen > limit) throw new BodyTooLarge();
    throw err;
  }
}

/** Optional coordinate: anything missing or out of range is dropped rather than failing the upload. */
const optionalNumber = (min: number, max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : null),
    z.number().min(min).max(max).nullable().catch(null),
  );

const MISSING_ID = "This upload is missing its id. Reload the page and try again.";

const Fields = z.object({
  taskId: z.string({ message: "Choose a task first." }).trim().min(1, "Choose a task first.").max(64),
  clientId: z
    .string({ message: MISSING_ID })
    .trim()
    .regex(/^[A-Za-z0-9_-]{8,64}$/, MISSING_ID),
  // Length is checked by submitProof, after trimming, with a friendlier message.
  text: z.string().nullable().catch(null),
  lat: optionalNumber(-90, 90),
  lng: optionalNumber(-180, 180),
  accuracy: optionalNumber(0, 100_000),
  // submitProof caps how much of the wait it believes.
  queuedFor: optionalNumber(0, Number.MAX_SAFE_INTEGER),
  teamId: z.string().trim().min(1).max(64).nullable().catch(null),
});

function fieldValue(form: FormData, name: string): string | null {
  const v = form.get(name);
  return typeof v === "string" ? v : null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ huntId: string }> }) {
  // The submission's time: when it arrived, not when a slow upload finished.
  const receivedAt = new Date();
  if (!isSameOrigin(req)) return refuse(403, "Uploads have to come from this site. Open the task page and try again.");

  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return refuse(
      413,
      `That’s too much to send at once. Each file can be up to ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB.`,
    );
  }

  const { huntId } = await ctx.params;
  const hunt = await getHuntById(huntId);
  if (!hunt) return refuse(404, "This hunt doesn’t exist.");
  const me = await getPlayer(hunt.id);
  if (!me) return refuse(401, "Join the hunt first.");

  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
    return refuse(415, "Send the proof as a form upload.");
  }

  let form: FormData;
  try {
    form = await readForm(req, MAX_BODY_BYTES);
  } catch (err) {
    if (err instanceof BodyTooLarge) {
      return refuse(
        413,
        `That’s too much to send at once. Each file can be up to ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB.`,
      );
    }
    return refuse(400, "The upload didn’t arrive in one piece. Try sending it again.");
  }

  const parsed = Fields.safeParse({
    taskId: fieldValue(form, "taskId"),
    clientId: fieldValue(form, "clientId"),
    text: fieldValue(form, "text"),
    lat: fieldValue(form, "lat"),
    lng: fieldValue(form, "lng"),
    accuracy: fieldValue(form, "accuracy"),
    queuedFor: fieldValue(form, "queuedFor"),
    teamId: fieldValue(form, "teamId"),
  });
  if (!parsed.success) return refuse(400, parsed.error.issues[0]?.message ?? "Check what you sent and try again.");
  const { taskId, clientId, text, lat, lng, accuracy, queuedFor, teamId } = parsed.data;

  const files: SubmitFile[] = [];
  for (const value of form.getAll("files")) {
    if (typeof value === "string") continue;
    files.push({ blob: value, name: value.name || null });
  }
  const posterValue = form.get("poster");
  const poster = posterValue && typeof posterValue !== "string" ? posterValue : null;
  const hasLocation = lat != null && lng != null;

  try {
    const result = await submitProof({
      hunt,
      me,
      taskId,
      clientId,
      text,
      files,
      poster,
      lat: hasLocation ? lat : null,
      lng: hasLocation ? lng : null,
      accuracy: hasLocation ? accuracy : null,
      receivedAt,
      queuedForMs: queuedFor,
      teamId,
    });
    if (!result.ok) {
      return refuse(
        result.status,
        result.error,
        result.retryAfterSec ? { "Retry-After": String(result.retryAfterSec) } : undefined,
        result.code,
      );
    }
    return reply(200, result);
  } catch (err) {
    console.error("[submissions] upload failed", err);
    return refuse(500, "Something went wrong on our side. Try again in a moment.");
  }
}
