"use client";

import { CloudUpload, Trash, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { flushQueue, listQueued, onQueueEvent } from "@/lib/offline/queue";
import { discardQueued, SendNowButton, useQueuedUploads } from "./queued-uploads";

const RETRY_EVERY_MS = 60_000;

/**
 * Mounted by PlayerShell for players on a team. Sends uploads saved on this
 * phone as soon as it can — on load, when the connection returns, when the
 * app comes back to the foreground, and every minute while any wait — and
 * shows what's still waiting (the task page lists its own).
 */
export function QueueFlusher({ huntId, slug }: { huntId: string; slug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const items = useQueuedUploads(huntId);

  useEffect(() => {
    const flush = () => {
      flushQueue().catch(() => {});
    };
    flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") flush();
    };
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => {
      listQueued()
        .then((list) => {
          if (list.some((item) => item.state !== "failed")) flush();
        })
        .catch(() => {});
    }, RETRY_EVERY_MS);
    return () => {
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

  // Tell the player how saved uploads went, whichever tab (or the service worker) sent them.
  useEffect(
    () =>
      onQueueEvent((event) => {
        if (event.type === "sent" && event.huntId === huntId) {
          // Instant decisions arrive as live results; only "waiting for a judge" needs a word here.
          if (!event.result || event.result.status === "pending") {
            toast({
              title: "Sent from this phone",
              description: `${event.label ?? "Your upload"} is with the judges now.`,
              tone: "success",
            });
          }
          router.refresh();
        } else if (event.type === "already" && event.huntId === huntId) {
          // A teammate finished the task while this waited for signal: nothing was lost.
          toast({
            title: "Nothing more to send",
            description: `${event.label ?? "Your upload"}: your team already completed this task.`,
          });
          router.refresh();
        } else if (event.type === "failed" && event.huntId === huntId) {
          toast({
            title: "Couldn’t send an upload",
            description: `${event.label ?? "Your upload"}: ${event.error}`,
            tone: "danger",
            durationMs: 8000,
          });
        }
      }),
    [huntId, router],
  );

  // The task page shows its own saved uploads in full.
  const onTask = /\/tasks\/([^/?#]+)/.exec(pathname)?.[1] ?? null;
  const elsewhere = items.filter((item) => item.taskId !== onTask);
  const waiting = elsewhere.filter((item) => item.state !== "failed");
  const failed = elsewhere.filter((item) => item.state === "failed");
  if (waiting.length === 0 && failed.length === 0) return null;

  return (
    <div className="mb-5 flex flex-col gap-2">
      {waiting.length > 0 ? (
        <div className="flex items-center gap-3 rounded-full border border-line bg-mist py-1.5 pr-1.5 pl-4 text-sm">
          <CloudUpload aria-hidden className="size-4 shrink-0 text-accent" />
          <p className="min-w-0 flex-1 font-semibold" aria-live="polite">
            {waiting.length === 1 ? "1 upload waiting to send" : `${waiting.length} uploads waiting to send`}
          </p>
          <SendNowButton className="h-10 rounded-full" />
        </div>
      ) : null}
      {failed.map((item) => (
        <div
          key={item.clientId}
          role="alert"
          className="flex items-start gap-3 rounded-lg bg-danger-wash px-4 py-3 text-sm"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              Couldn’t send{" "}
              <Link href={`/h/${slug}/tasks/${item.taskId}`} className="underline underline-offset-2">
                {item.label ?? "an upload"}
              </Link>
            </p>
            <p className="text-ink-2">{item.error ?? "The server turned it down."}</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Remove ${item.label ?? "this upload"} from this phone`}
            onClick={() => discardQueued(item.clientId)}
            className="-my-2 -mr-2 shrink-0"
          >
            <Trash aria-hidden />
          </Button>
        </div>
      ))}
    </div>
  );
}
