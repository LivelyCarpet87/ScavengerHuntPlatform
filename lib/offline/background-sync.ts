import { QUEUE_SYNC_TAG } from "./queue";

type SyncRegistration = ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } };

/**
 * Asks the service worker to flush the upload queue as soon as the phone has
 * signal again, even if the player closes the app (Background Sync; Chromium
 * browsers). Page-only. Resolves false where it isn't available — the queue
 * flusher in the page covers those browsers.
 */
export async function requestBackgroundSync(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
    // `ready` never settles without a registration (e.g. in development), so check first.
    if (!(await navigator.serviceWorker.getRegistration())) return false;
    const registration = (await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ])) as SyncRegistration | null;
    if (!registration?.sync) return false;
    await registration.sync.register(QUEUE_SYNC_TAG);
    return true;
  } catch {
    return false;
  }
}
