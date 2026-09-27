import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getPlayer, getStaffRole, sessionStanding } from "@/lib/auth/access";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { hunts } from "@/lib/db/schema";
import { getHuntById } from "@/lib/hunts";
import { freezeWatch } from "@/lib/live/freeze-watch";
import { busInfo, type HuntEventEnvelope, replaySince, subscribe } from "@/lib/realtime/bus";
import { type EventViewer, eventForViewer } from "@/lib/realtime/filter";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream of hunt events for the current viewer.
 * Clients: useHuntEvents() / <LiveRefresh> in components/live.
 *
 * `?since=<seq>&boot=<id>` (from the last `hello` and events the browser saw)
 * resumes after a drop: the events this viewer missed are replayed first, or
 * `event: resync` says they can't be and the page should reload. `hello`
 * carries `{ boot, seq }`; a named `ping` every 20 s lets clients notice a
 * connection that died silently.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ huntId: string }> }) {
  const { huntId } = await ctx.params;
  const hunt = await getHuntById(huntId);
  if (!hunt) return new Response("Not found", { status: 404 });
  const role = await getStaffRole(huntId);
  const me = role ? null : await getPlayer(huntId);
  const isPublic = hunt.scoreboardVisibility === "public" && hunt.status !== "draft";
  if (!role && (hunt.status === "draft" || (!me && !isPublic))) {
    return new Response("Not found", { status: 404 });
  }
  // Other teams' score changes can't move a frozen board, so players and the public don't get them.
  const freeze = role ? null : freezeWatch(hunt);
  const viewer: EventViewer = { staff: !!role, teamId: me?.team.id ?? null, frozen: freeze?.frozen };
  const sessionId = (await getSession())?.session.id ?? null;
  const params = req.nextUrl.searchParams;
  const sinceParam = params.get("since") ?? req.headers.get("last-event-id");
  const since = sinceParam && /^\d+$/.test(sinceParam) ? Number(sinceParam) : null;
  const boot = params.get("boot");

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const send = (event: HuntEventEnvelope) => {
        if (event.type === "hunt.changed") freeze?.reload();
        const visible = eventForViewer(event, viewer);
        if (visible) write(`event: hunt\nid: ${visible.seq}\ndata: ${JSON.stringify(visible)}\n\n`);
      };
      write("retry: 3000\n\n");
      // Catch up, say hello, go live: one synchronous block, so no event falls in between.
      if (since != null) {
        const missed = boot && boot !== busInfo().boot ? "gap" : replaySince(huntId, since);
        if (missed === "gap") write("event: resync\ndata: {}\n\n");
        else for (const event of missed) send(event);
      }
      write(`event: hello\ndata: ${JSON.stringify({ at: Date.now(), ...busInfo() })}\n\n`);
      const unsubscribe = subscribe(huntId, send);
      // Keeps proxies and phones from closing an idle connection; named, so clients can tell it's alive.
      const ping = setInterval(() => write("event: ping\ndata: {}\n\n"), 20_000);
      // Who the viewer is can change while the stream stays open: a player leaves or switches
      // team, a judge is removed, someone signs out, the hunt goes back to draft. Re-check every
      // 30 s, and at once when their team or the hunt changes; when it no longer matches, end
      // the stream: the browser reconnects within seconds and gets what it may see now.
      let checking = false;
      const recheck = async () => {
        if (checking) return;
        checking = true;
        try {
          if (!(await stillAllowed(huntId, sessionId, viewer))) end();
        } catch (err) {
          console.error("[events] could not re-check access", err);
        } finally {
          checking = false;
        }
      };
      const unwatch = subscribe(huntId, (e) => {
        if (e.type === "hunt.changed" || (e.type === "teams.changed" && (!e.teamId || e.teamId === viewer.teamId))) {
          void recheck();
        }
      });
      const recheckTimer = setInterval(() => void recheck(), 30_000);
      const end = () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      cleanup = () => {
        unsubscribe();
        unwatch();
        clearInterval(ping);
        clearInterval(recheckTimer);
        cleanup = () => {};
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Whether this session is still the viewer the stream was opened for, and may still watch the hunt. */
async function stillAllowed(huntId: string, sessionId: string | null, viewer: EventViewer): Promise<boolean> {
  const [standing, hunt] = await Promise.all([
    sessionId ? sessionStanding(sessionId, huntId) : { role: null, teamId: null },
    db
      .select({ status: hunts.status, scoreboardVisibility: hunts.scoreboardVisibility })
      .from(hunts)
      .where(eq(hunts.id, huntId))
      .get(),
  ]);
  if (!hunt) return false;
  if (viewer.staff) return standing.role !== null;
  if (standing.role !== null || standing.teamId !== viewer.teamId || hunt.status === "draft") return false;
  return !!standing.teamId || hunt.scoreboardVisibility === "public";
}
