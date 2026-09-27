// CONTRACT STUB — implemented by the tasks & submissions area.
// Runs in pages AND in the service worker: IndexedDB + fetch only, no DOM,
// no React, no server imports. Keep the exported names and signatures.

/** Background Sync tag the service worker listens for. */
export const QUEUE_SYNC_TAG = "shp-submissions";

export type QueuedFile = { name: string; type: string; blob: Blob };

export type QueuedSubmission = {
  /** Idempotency key sent to the server; also the IndexedDB key. */
  clientId: string;
  huntId: string;
  taskId: string;
  text?: string | null;
  files: QueuedFile[];
  poster?: QueuedFile | null;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  createdAt: number;
  attempts: number;
  state: "queued" | "sending" | "failed";
  /** Last non-retryable error message (state "failed"). */
  error?: string | null;
};

export type NewQueuedSubmission = Omit<QueuedSubmission, "attempts" | "state" | "error" | "createdAt">;

/** Saves a submission on the device to send later. */
export async function enqueueSubmission(_item: NewQueuedSubmission): Promise<void> {
  throw new Error("offline queue not implemented yet");
}

/** Queued submissions, optionally for one hunt, oldest first. */
export async function listQueued(_huntId?: string): Promise<QueuedSubmission[]> {
  return [];
}

export async function removeQueued(_clientId: string): Promise<void> {}

/**
 * Tries to send every queued submission (POST /api/hunts/[huntId]/submissions).
 * Removes sent ones, marks non-retryable failures, keeps the rest for later.
 */
export async function flushQueue(): Promise<{ sent: number; failed: number; remaining: number }> {
  return { sent: 0, failed: 0, remaining: 0 };
}

/** Subscribe to queue changes from any tab or the service worker. Returns an unsubscribe function. */
export function onQueueChange(_cb: () => void): () => void {
  return () => {};
}
