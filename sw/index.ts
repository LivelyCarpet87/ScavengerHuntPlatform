/// <reference lib="webworker" />
/**
 * Service worker. Bundled by Bun into public/sw.js (`bun run sw:build`, which
 * `dev` and `build` run first) and registered by components/pwa/sw-register.tsx.
 *
 * Caches
 *   shell   /offline plus its CSS, JS and fonts, and the app icons — precached at install
 *   static  /_next/static/* — cache-first; only immutable (production) responses are kept
 *   media   photo derivatives (/files/<id>/thumb|display|poster), images, fonts —
 *           cache-first, capped at MEDIA_LIMIT entries (oldest trimmed first)
 *   pages   navigations — network-first with a NAV_TIMEOUT_MS timeout, falling back to
 *           the last copy of the page, then (after NAV_GIVE_UP_MS) to /offline. A
 *           gateway error while the server restarts also shows the last copy.
 * Never touched: other origins, non-GET (Server Action POSTs), /api/*, event
 * streams, RSC payloads (RSC: 1 or ?_rsc=), /files/<id>/original, range requests.
 *
 * Also
 *   sync                     flushes the offline submission queue (lib/offline/queue.ts)
 *   push                     shows the notification the server sent (lib/push.ts payloads)
 *   notificationclick        focuses an open window on the right page, or opens one
 *   pushsubscriptionchange   re-subscribes and tells the server
 *   message SKIP_WAITING     activates a waiting update when the page asks (the "Reload" button)
 */
import { flushQueue, QUEUE_SYNC_TAG } from "@/lib/offline/queue";

declare const self: ServiceWorkerGlobalScope;

// Background Sync isn't in TypeScript's lib yet.
interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
  readonly lastChance: boolean;
}
declare global {
  interface ServiceWorkerGlobalScopeEventMap {
    sync: SyncEvent;
  }
}

/** Bump when the shell or page cache format changes; old caches are deleted on activate. */
const VERSION = "2026-09-28";
const SHELL = `shp-shell-${VERSION}`;
const PAGES = `shp-pages-${VERSION}`;
/** Content-addressed, so these survive updates (trimmed by count instead). */
const STATIC = "shp-static";
const MEDIA = "shp-media";
const CURRENT = new Set([SHELL, PAGES, STATIC, MEDIA]);

const OFFLINE_URL = "/offline";
const SHELL_ASSETS = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon-180.png",
  "/icons/badge-96.png",
  "/brand/hedgehog-192.png",
];

/** A navigation slower than this shows the saved copy of the page, if there is one… */
const NAV_TIMEOUT_MS = 4000;
/** …and with no saved copy, the offline page once the network has had this long in total. */
const NAV_GIVE_UP_MS = 15_000;
/** What a reverse proxy answers while the app restarts. */
const GATEWAY_ERROR = new Set([502, 503, 504]);
const MEDIA_LIMIT = 300;
const PAGES_LIMIT = 60;
const STATIC_LIMIT = 500;

// Lifecycle ------------------------------------------------------------------------

self.addEventListener("install", (event) => {
  // No skipWaiting here: an update waits until the page offers "Reload" (or every tab closes).
  event.waitUntil(precacheShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("shp-") && !CURRENT.has(n)).map((n) => caches.delete(n)));
      await self.registration.navigationPreload?.enable().catch(() => undefined);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | null)?.type === "SKIP_WAITING") void self.skipWaiting();
});

/** The offline page and everything it needs to render, plus the icons. */
async function precacheShell(): Promise<void> {
  const cache = await caches.open(SHELL);
  const page = await fetch(OFFLINE_URL, { cache: "reload", credentials: "omit" });
  if (!page.ok) throw new Error(`Couldn't precache ${OFFLINE_URL} (${page.status})`);
  const html = await page.clone().text();
  await cache.put(OFFLINE_URL, page);

  const assets = new Set<string>(SHELL_ASSETS);
  for (const url of staticUrls(html)) assets.add(url);
  const fetched = await Promise.all(
    [...assets].map(async (url) => {
      try {
        const res = await fetch(url, { cache: "reload" });
        if (!res.ok) return null;
        await cache.put(url, res.clone());
        return url.endsWith(".css") ? await res.text() : null;
      } catch {
        return null; // best effort: the page still works without a missing chunk
      }
    }),
  );
  // Fonts referenced from the stylesheets.
  const fonts = new Set<string>();
  for (const css of fetched) if (css) for (const url of staticUrls(css)) if (!assets.has(url)) fonts.add(url);
  await Promise.all(
    [...fonts].map(async (url) => {
      try {
        const res = await fetch(url, { cache: "reload" });
        if (res.ok) await cache.put(url, res);
      } catch {
        // best effort
      }
    }),
  );

  // An update that kept VERSION reuses this cache: drop the previous offline page's chunks. Safe even
  // while the old worker is still in charge, because /offline itself was just replaced.
  const key = (url: string) => {
    const { pathname, search } = new URL(url, self.location.origin);
    return pathname + search;
  };
  const wanted = new Set([OFFLINE_URL, ...assets, ...fonts].map(key));
  for (const request of await cache.keys()) {
    if (!wanted.has(key(request.url))) await cache.delete(request);
  }
}

/** /_next/static/… URLs mentioned in HTML, inline flight data or CSS. */
function staticUrls(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(/\/_next\/static\/[^"'\s\\)<>]+/g)) {
    out.add(match[0].replace(/&amp;/g, "&"));
  }
  return [...out];
}

// Fetch ------------------------------------------------------------------------------

const MEDIA_FILE = /^\/files\/[^/]+\/(thumb|display|poster)\/?$/;
const ORIGINAL_FILE = /^\/files\/[^/]+\/original\/?$/;
const MEDIA_EXTENSION = /\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?)$/i;
/**
 * Pages not kept for offline use: staff and account pages (little use offline, and
 * not wanted lying around on a shared phone after signing out) and the offline page.
 */
const NO_PAGE_CACHE = /^\/(login|signup|setup|invite|admin|manage|dashboard|offline)(\/|$)/;

function passThrough(request: Request, url: URL): boolean {
  const path = url.pathname;
  if (url.origin !== self.location.origin) return true;
  if (path.startsWith("/api/") || path.startsWith("/__") || path === "/sw.js") return true;
  if (request.headers.get("rsc") === "1" || url.searchParams.has("_rsc")) return true;
  if ((request.headers.get("accept") ?? "").includes("text/event-stream")) return true;
  if (ORIGINAL_FILE.test(path)) return true;
  if (request.headers.has("range")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  // Chrome DevTools issues these; answering them from here throws.
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;
  const url = new URL(request.url);
  if (passThrough(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(navigation(event, url));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staticAsset(event));
  } else if (
    MEDIA_FILE.test(url.pathname) ||
    request.destination === "image" ||
    request.destination === "font" ||
    MEDIA_EXTENSION.test(url.pathname)
  ) {
    event.respondWith(mediaAsset(event));
  }
});

/**
 * Network first. A slow network with a saved copy shows the copy (the network still
 * refreshes it in the background); with no copy it keeps waiting until NAV_GIVE_UP_MS,
 * then shows the offline page, whose "Try again" reloads this address.
 */
async function navigation(event: FetchEvent, url: URL): Promise<Response> {
  const key = url.origin + url.pathname + url.search;
  const keep = !NO_PAGE_CACHE.test(url.pathname);
  const cache = await caches.open(PAGES);

  const network = (async () => {
    const preloaded = (await event.preloadResponse) as Response | undefined;
    const response = preloaded ?? (await fetch(event.request));
    if (keep && response.ok && response.type === "basic") {
      const copy = response.clone();
      event.waitUntil(cache.put(key, copy).then(() => trim(PAGES, PAGES_LIMIT)));
    }
    return response;
  })();
  // Whatever happens to the race below, let the request finish (and refresh the saved copy).
  event.waitUntil(network.then(noop, noop));

  // The saved copy of this page; for launch URLs like /?source=pwa, the same page under any query.
  const savedCopy = async () =>
    keep
      ? ((await cache.match(key, { ignoreVary: true })) ??
        (await cache.match(url.origin + url.pathname, { ignoreVary: true, ignoreSearch: true })))
      : undefined;

  try {
    const first = await Promise.race([network, delay(NAV_TIMEOUT_MS)]);
    // The proxy answers 502–504 while the app restarts: the last copy beats an error page.
    if (first) return GATEWAY_ERROR.has(first.status) ? ((await savedCopy()) ?? first) : first;
    const saved = await savedCopy();
    if (saved) return saved;
    const late = await Promise.race([network, delay(NAV_GIVE_UP_MS - NAV_TIMEOUT_MS)]);
    return late ?? (await offlinePage());
  } catch {
    return (await savedCopy()) ?? (await offlinePage());
  }
}

async function offlinePage(): Promise<Response> {
  return (await caches.match(OFFLINE_URL)) ?? offlineFallback();
}

/** Hashed build assets: cache-first. Dev-server chunks aren't immutable, so they're never stored. */
async function staticAsset(event: FetchEvent): Promise<Response> {
  const { request } = event;
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic" && /immutable/.test(response.headers.get("cache-control") ?? "")) {
      const copy = response.clone();
      event.waitUntil(cache.put(request, copy).then(() => trim(STATIC, STATIC_LIMIT)));
    }
    return response;
  } catch {
    // Offline: the offline page's own assets live in the shell cache.
    return (await caches.match(request)) ?? Response.error();
  }
}

/** Photos, images and fonts: cache-first with a size cap. */
async function mediaAsset(event: FetchEvent): Promise<Response> {
  const { request } = event;
  const cache = await caches.open(MEDIA);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response.status === 200 && response.type === "basic") {
      const copy = response.clone();
      event.waitUntil(cache.put(request, copy).then(() => trim(MEDIA, MEDIA_LIMIT)));
    }
    return response;
  } catch {
    return (await caches.match(request)) ?? Response.error();
  }
}

/** Keeps a cache at `max` entries by deleting the oldest (entries are listed in insertion order). */
async function trim(name: string, max: number): Promise<void> {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

function delay(ms: number): Promise<undefined> {
  return new Promise((resolve) => setTimeout(() => resolve(undefined), ms));
}

function noop() {}

function offlineFallback(): Response {
  return new Response(
    "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Offline</title><body style='font:16px system-ui;padding:2rem'><h1>You're offline</h1><p>Reconnect, then reload this page.</p>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

// Background Sync ---------------------------------------------------------------------

self.addEventListener("sync", (event) => {
  if (event.tag !== QUEUE_SYNC_TAG) return;
  event.waitUntil(
    (async () => {
      const result = await flushQueue();
      // Rejecting asks the browser to try again later (with backoff), unless it's the last chance.
      if (result.remaining > 0 && !event.lastChance) {
        throw new Error(`${result.remaining} queued submission(s) still waiting for the network`);
      }
    })(),
  );
});

// Push ------------------------------------------------------------------------------------

type PushData = { title?: string; body?: string; url?: string; tag?: string };
type ShowOptions = NotificationOptions & { renotify?: boolean; vibrate?: number[]; timestamp?: number };

self.addEventListener("push", (event) => {
  let data: PushData = {};
  try {
    data = (event.data?.json() as PushData | null) ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  const options: ShowOptions = {
    body: data.body ?? "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: data.tag,
    // A newer notification with the same tag replaces the old one; still buzz for it.
    renotify: Boolean(data.tag),
    vibrate: [40, 60, 40],
    timestamp: Date.now(),
    data: { url: data.url ?? "/" },
  };
  event.waitUntil(self.registration.showNotification(data.title || "New update", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data as { url?: string } | null)?.url ?? "/";
  let target = new URL(raw, self.location.origin);
  if (target.origin !== self.location.origin) target = new URL("/", self.location.origin);
  event.waitUntil(focusOrOpen(target.href));
});

async function focusOrOpen(href: string): Promise<unknown> {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const exact = windows.find((w) => w.url === href);
  if (exact) return exact.focus();
  // Prefer a window this worker controls: only those can be navigated.
  const candidate = windows.find((w) => w.visibilityState === "visible") ?? windows[0];
  if (candidate) {
    try {
      const focused = await candidate.focus();
      const navigated = await focused.navigate(href);
      if (navigated) return navigated;
    } catch {
      // Not controlled by this worker, or navigate() unsupported: open a window instead.
    }
  }
  return self.clients.openWindow(href);
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(resubscribe(event.oldSubscription?.endpoint ?? null));
});

/** The browser rotated the subscription: make a new one and tell the server (same device session). */
async function resubscribe(oldEndpoint: string | null): Promise<void> {
  const keyResponse = await fetch("/api/push", { cache: "no-store" });
  if (!keyResponse.ok) return;
  const { publicKey } = (await keyResponse.json()) as { publicKey: string };
  const subscription = await self.registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(publicKey),
  });
  await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (oldEndpoint && oldEndpoint !== subscription.endpoint) {
    await fetch("/api/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: oldEndpoint }),
    }).catch(noop);
  }
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
