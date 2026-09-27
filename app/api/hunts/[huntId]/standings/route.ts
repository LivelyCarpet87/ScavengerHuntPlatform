import type { NextRequest } from "next/server";
import { getHuntById } from "@/lib/hunts";
import { loadStandings } from "@/lib/live/standings";
import { canSeeBoard, getLiveViewer, ROOM } from "@/lib/live/viewer";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

/**
 * GET /api/hunts/[huntId]/standings
 * → { phase, frozenAt, startsAt, endsAt, updatedAt, standings: [{ rank, teamId, name, emoji, color, total, solved, placements, hidden }] }
 *
 * Computed at the viewer's freeze cutoff; hidden teams only for staff.
 * `?audience=room` asks for what the players see (the big screen uses it so a
 * projector opened by staff never shows live scores during a freeze). It can
 * only narrow what the viewer gets, never widen it.
 * 404 when the viewer may not see the scoreboard.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ huntId: string }> }) {
  const { huntId } = await ctx.params;
  const hunt = await getHuntById(huntId);
  if (!hunt) return Response.json({ error: "Not found" }, { status: 404, headers });
  const viewer = await getLiveViewer(hunt.id);
  if (!canSeeBoard(hunt, viewer)) return Response.json({ error: "Not found" }, { status: 404, headers });

  const audience = req.nextUrl.searchParams.get("audience") === "room" ? ROOM : viewer;
  const { payload } = await loadStandings(hunt, audience);
  return Response.json(payload, { headers });
}
