import type { NextRequest } from "next/server";
import { getPlayer, getStaffRole } from "@/lib/auth/access";
import { getHuntById } from "@/lib/hunts";
import { subscribe } from "@/lib/realtime/bus";
import { eventForViewer } from "@/lib/realtime/filter";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream of hunt events for the current viewer.
 * Clients: useHuntEvents() / <LiveRefresh> in components/live.
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
  const viewer = { staff: !!role, teamId: me?.team.id ?? null };

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
      write(`retry: 3000\n\nevent: hello\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);
      const unsubscribe = subscribe(huntId, (event) => {
        const visible = eventForViewer(event, viewer);
        if (visible) write(`event: hunt\nid: ${visible.seq}\ndata: ${JSON.stringify(visible)}\n\n`);
      });
      // Comments keep proxies and phones from closing an idle connection.
      const ping = setInterval(() => write(": ping\n\n"), 20_000);
      cleanup = () => {
        unsubscribe();
        clearInterval(ping);
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
