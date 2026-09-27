"use client";

import { CloudUpload, RotateCw, Trash, TriangleAlert, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { formatRelative } from "@/lib/format";
import {
  flushQueue,
  listQueued,
  onQueueChange,
  type QueuedSubmission,
  removeQueued,
  retryQueued,
} from "@/lib/offline/queue";
import { cn } from "@/lib/utils";
import { PlainImg } from "./plain-img";

/** Queued submissions on this device for a hunt (optionally one task), kept in sync across tabs. */
export function useQueuedUploads(huntId: string, taskId?: string): QueuedSubmission[] {
  const [items, setItems] = useState<QueuedSubmission[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => {
      listQueued(huntId)
        .then((list) => {
          if (alive) setItems(taskId ? list.filter((item) => item.taskId === taskId) : list);
        })
        .catch(() => {});
    };
    load();
    const off = onQueueChange(load);
    return () => {
      alive = false;
      off();
    };
  }, [huntId, taskId]);
  return items;
}

/**
 * Sends everything saved on this phone now. Never throws: a browser that
 * can't reach its storage gets a toast instead of an unhandled rejection.
 */
export async function sendQueuedNow(): Promise<void> {
  try {
    await flushQueue();
  } catch {
    toast({
      title: "Couldn't reach the saved uploads",
      description: "This browser blocked its storage. Reload the page and try again.",
      tone: "danger",
    });
  }
}

/** Takes an upload off this phone for good. */
export async function discardQueued(clientId: string): Promise<void> {
  try {
    await removeQueued(clientId);
  } catch {
    toast({ title: "Couldn't remove that upload", description: "Reload the page and try again.", tone: "danger" });
  }
}

/** "Send now" for everything waiting on this phone, with its own pending state. */
export function SendNowButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      pending={busy}
      className={className}
      onClick={async () => {
        setBusy(true);
        await sendQueuedNow();
        setBusy(false);
      }}
    >
      Send now
    </Button>
  );
}

function QueuedThumb({ item }: { item: QueuedSubmission }) {
  const image = item.files.find((f) => f.type.startsWith("image/")) ?? item.poster ?? null;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image) return;
    const next = URL.createObjectURL(image.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [image]);
  const video = item.files.some((f) => f.type.startsWith("video/"));
  return (
    <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-sm bg-mist-2 text-ink-2">
      {url ? (
        <PlainImg src={url} alt="" className="size-full object-cover" />
      ) : video ? (
        <Video aria-hidden className="size-5" />
      ) : (
        <CloudUpload aria-hidden className="size-5" />
      )}
    </span>
  );
}

function statusLine(item: QueuedSubmission, now: number): string {
  if (item.state === "sending") return "Sending now…";
  if (item.state === "failed") return item.error ?? "The server turned it down.";
  if (item.attempts > 0 && item.lastAttemptAt) {
    return `Waiting for signal. Last try ${formatRelative(item.lastAttemptAt, now)}.`;
  }
  return `Saved ${formatRelative(item.createdAt, now)}. Waiting for signal.`;
}

/** The uploads waiting on this phone, each with what can be done about it. */
export function QueuedUploadList({ items, className }: { items: QueuedSubmission[]; className?: string }) {
  // Only rendered after the queue loads in the browser, so reading the clock here can't upset hydration.
  const now = Date.now();
  if (items.length === 0) return null;

  return (
    <ul className={cn("flex flex-col divide-y divide-line", className)}>
      {items.map((item) => (
        <li key={item.clientId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <QueuedThumb item={item} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug break-words">{item.label ?? "Upload"}</p>
            <p
              className={cn(
                "mt-0.5 flex items-start gap-1.5 text-sm",
                item.state === "failed" ? "font-medium text-danger" : "text-ink-2",
              )}
            >
              {item.state === "failed" ? <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" /> : null}
              {item.state === "sending" ? <Spinner className="mt-0.5 size-3.5 shrink-0" /> : null}
              <span>
                {item.state === "failed" ? "Couldn't send: " : null}
                {statusLine(item, now)}
              </span>
            </p>
          </div>
          <div className="-mr-2 flex shrink-0 items-center">
            {item.state === "failed" ? (
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Try sending ${item.label ?? "this upload"} again`}
                onClick={async () => {
                  try {
                    await retryQueued(item.clientId);
                  } catch {
                    // Nothing to retry (it was removed meanwhile); sending below reports anything else.
                  }
                  await sendQueuedNow();
                }}
              >
                <RotateCw aria-hidden />
              </Button>
            ) : null}
            {item.state !== "sending" ? (
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remove ${item.label ?? "this upload"} from this phone`}
                onClick={() => discardQueued(item.clientId)}
              >
                <Trash aria-hidden />
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
