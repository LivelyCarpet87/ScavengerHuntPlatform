import type { NextRequest } from "next/server";
import { getHuntById } from "@/lib/hunts";
import { FEED_DEFAULT_LIMIT, loadFeed } from "@/lib/live/feed";
import { canSeeBoard, getLiveViewer, ROOM } from "@/lib/live/viewer";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

/**
 * GET /api/hunts/[huntId]/feed?limit=30
 * → { items: [punch | announcement, …], galleryOpen, frozenAt }
 *
 * Recent accepted submissions (team, task, points, time and — when the
 * gallery is open to the viewer — thumb/display URLs) and announcements,
 * newest first. Nothing after the freeze reaches non-staff.
 * `?audience=room` narrows the result to what players see (big screen).
 * 404 when the viewer may not see the scoreboard.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ huntId: string }> }) {
  const { huntId } = await ctx.params;
  const hunt = await getHuntById(huntId);
  if (!hunt) return Response.json({ error: "Not found" }, { status: 404, headers });
  const viewer = await getLiveViewer(hunt.id);
  if (!canSeeBoard(hunt, viewer)) return Response.json({ error: "Not found" }, { status: 404, headers });

  const params = req.nextUrl.searchParams;
  const audience = params.get("audience") === "room" ? ROOM : viewer;
  const limit = Number(params.get("limit") ?? FEED_DEFAULT_LIMIT);
  const payload = await loadFeed(hunt, audience, { limit: Number.isFinite(limit) ? limit : FEED_DEFAULT_LIMIT });
  return Response.json(payload, { headers });
}
