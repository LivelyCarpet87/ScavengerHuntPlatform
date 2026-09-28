import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { getStaffRole } from "@/lib/auth/access";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { attachmentDisposition } from "@/lib/export/csv";
import { mediaSources, standingsCsv, submissionsCsv, teamsCsv } from "@/lib/export/exports";
import { exportFilename, safeSlug } from "@/lib/export/names";
import { zipStream } from "@/lib/export/zip";
import { getHuntById } from "@/lib/hunts";
import { isSameOrigin } from "@/lib/platform/http";
import { rateLimit } from "@/lib/rate-limit";
import { baseUrl } from "@/lib/url";

export const dynamic = "force-dynamic";

const KINDS = ["standings.csv", "submissions.csv", "teams.csv", "media.zip"] as const;
type Kind = (typeof KINDS)[number];

/** Downloads per organizer per window: plenty for a ZIP per task, not for a runaway loop. */
const EXPORT_LIMIT = 60;
const EXPORT_WINDOW_MS = 10 * 60_000;

function plain(status: number, body: string, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8", ...headers },
  });
}

function notFound() {
  return plain(404, "Not found");
}

/**
 * Exports start from this site's pages, a bookmark or the address bar. A page
 * on another site mustn't be able to make an organizer's browser build (and
 * log) exports with their cookie, even though it can't read the result.
 */
function fromAnotherSite(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return true;
  // Browsers without Fetch Metadata: an Origin header, when there is one, must be ours.
  return req.headers.has("origin") && !isSameOrigin(req);
}

/**
 * Hunt exports for staff: standings, submissions and teams as CSV, and the
 * original photos and videos of accepted submissions as a streamed ZIP
 * (optionally one task: ?task=<id>). Anyone else gets a 404, so the route
 * doesn't reveal that a hunt exists.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ huntId: string; kind: string }> }) {
  const { huntId, kind } = await ctx.params;
  if (fromAnotherSite(req)) {
    // Someone followed an export link from elsewhere (an email, a chat): send them to
    // the export buttons rather than start a download they didn't start here.
    const dest = req.headers.get("sec-fetch-dest");
    if (req.headers.get("sec-fetch-mode") === "navigate" && (dest === "document" || dest == null)) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: `/manage/${encodeURIComponent(huntId)}/scoreboard#export-title`,
          "Cache-Control": "no-store",
        },
      });
    }
    return plain(403, "Exports can only be downloaded from the hunt’s scoreboard.");
  }
  if (!(KINDS as readonly string[]).includes(kind)) return notFound();
  const hunt = await getHuntById(huntId);
  if (!hunt) return notFound();
  const role = await getStaffRole(hunt.id);
  const session = await getSession();
  if (!role || !session?.user) return notFound();
  const limit = rateLimit(`export:${session.user.id}`, EXPORT_LIMIT, EXPORT_WINDOW_MS);
  if (!limit.ok) {
    return plain(429, `Too many downloads in a row. Try again in ${limit.retryAfterSec} seconds.`, {
      "Retry-After": String(limit.retryAfterSec),
    });
  }

  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  const logExport = (data: Record<string, unknown> = {}) =>
    audit({
      huntId: hunt.id,
      actorUserId: session.user?.id ?? null,
      action: "export.download",
      targetKind: "hunt",
      targetId: hunt.id,
      data: { kind, ...data },
    });

  const csv = async (body: string) => {
    headers.set("Content-Type", "text/csv; charset=utf-8");
    headers.set("Content-Disposition", attachmentDisposition(exportFilename(hunt.slug, kind)));
    await logExport();
    return new Response(body, { status: 200, headers });
  };

  switch (kind as Kind) {
    case "standings.csv":
      return csv(await standingsCsv(hunt));
    case "submissions.csv":
      return csv(await submissionsCsv(hunt, await baseUrl()));
    case "teams.csv":
      return csv(await teamsCsv(hunt));
    case "media.zip": {
      const taskParam = req.nextUrl.searchParams.get("task");
      let filename = exportFilename(hunt.slug, "media.zip");
      if (taskParam) {
        const task = await db
          .select({ id: tasks.id, code: tasks.code, title: tasks.title })
          .from(tasks)
          .where(and(eq(tasks.id, taskParam), eq(tasks.huntId, hunt.id)))
          .get();
        if (!task) return notFound();
        filename = exportFilename(hunt.slug, `media-${task.code}-${safeSlug(task.title, "task", 40)}.zip`);
      }
      const sources = await mediaSources(hunt, taskParam);
      headers.set("Content-Type", "application/zip");
      headers.set("Content-Disposition", attachmentDisposition(filename));
      await logExport(taskParam ? { taskId: taskParam, files: sources.length } : { files: sources.length });
      return new Response(zipStream(sources), { status: 200, headers });
    }
  }
}
