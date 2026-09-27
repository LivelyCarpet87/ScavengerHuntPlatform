import { forgetSavedCopies } from "@/lib/platform/saved-copies";

/**
 * Forgets the pages and photos the service worker saved on this device, so the
 * next person using the phone can't open them offline — call it when leaving a
 * team (pass the hunt's slug) or signing out (no slug: everything). Also tells
 * the worker, so a page still loading can't be saved again afterwards. Never
 * throws; client-only.
 */
export async function forgetThisDevice(huntSlug: string | null = null): Promise<void> {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "PURGE", huntSlug });
  } catch {
    // no worker in charge: nothing is loading through it
  }
  try {
    await forgetSavedCopies(huntSlug);
  } catch {
    // Cache Storage unavailable (private mode, blocked storage): nothing was saved
  }
}
