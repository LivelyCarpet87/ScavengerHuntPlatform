import { belongsToHunt, CACHE, SAVED_AT_HEADER, SAVED_TITLE_HEADER } from "./sw-policy";

/*
 * Reading and clearing what the service worker saved on this device (Cache
 * Storage). Runs in pages and in the worker; does nothing where Cache Storage
 * isn't available.
 */

function hasCaches(): boolean {
  return typeof caches !== "undefined";
}

/**
 * Deletes saved pages and photos, so the next person on this phone can't open
 * them offline. With a hunt slug (leaving a team): that hunt's saved pages and
 * the home page that lists it, plus every saved photo. Without (signing out):
 * every saved page and photo. Pages keep working online; the worker saves them
 * again as they're visited.
 */
export async function forgetSavedCopies(huntSlug: string | null = null): Promise<void> {
  if (!hasCaches()) return;
  const names = await caches.keys();
  await Promise.all(
    names.map(async (name) => {
      if (name === CACHE.media || name === CACHE.gallery) {
        await caches.delete(name);
      } else if (name.startsWith(CACHE.pagesPrefix)) {
        if (!huntSlug) {
          await caches.delete(name);
          return;
        }
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          if (belongsToHunt(new URL(request.url).pathname, huntSlug)) await cache.delete(request);
        }
      }
    }),
  );
}

export type SavedPage = {
  /** Path and query, e.g. "/h/campus-night-hunt/team". */
  href: string;
  pathname: string;
  title: string | null;
  /** ISO time the copy was saved, when known. */
  savedAt: string | null;
};

/** Pages saved for offline use, most recently saved first. */
export async function listSavedPages(): Promise<SavedPage[]> {
  if (!hasCaches()) return [];
  const pages: SavedPage[] = [];
  for (const name of await caches.keys()) {
    if (!name.startsWith(CACHE.pagesPrefix)) continue;
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      const response = await cache.match(request, { ignoreVary: true });
      if (!response) continue;
      const url = new URL(request.url);
      const encodedTitle = response.headers.get(SAVED_TITLE_HEADER);
      let title: string | null = null;
      try {
        title = encodedTitle ? decodeURIComponent(encodedTitle) : null;
      } catch {
        title = null;
      }
      pages.push({
        href: url.pathname + url.search,
        pathname: url.pathname,
        title,
        savedAt: response.headers.get(SAVED_AT_HEADER),
      });
    }
  }
  return pages.sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""));
}
