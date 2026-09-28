/// <reference lib="webworker" />
/**
 * Service worker. Bundled by Bun into public/sw.js (`bun run sw:build`, which
 * `dev` and `build` run first) and registered by components/pwa/sw-register.tsx.
 * What gets kept and why lives in lib/platform/sw-policy.ts.
 *
 * Caches
 *   shell    /offline plus its CSS, JS and fonts, and the notification icons — precached at install
 *   static   /_next/static/* — cache-first; only immutable (production) responses are kept
 *   media    images and fonts on players' pages (task attachments, the team's photos,
 *            terrain, icons) — cache-first, capped at MEDIA_LIMIT (oldest trimmed first)
 *   gallery  photos seen in the gallery or on the big screen — same, capped at GALLERY_LIMIT,
 *            so browsing hundreds of photos can't push out the ones that matter offline.
 *            Photos on staff pages aren't kept at all.
 *   pages    navigations to player pages — network-first with a NAV_TIMEOUT_MS timeout,
 *            falling back to the last copy of the page, then (after NAV_GIVE_UP_MS) to
 *            /offline. A gateway error while the server restarts also shows the last copy.
 *            A saved copy is marked on <html> (data-saved-copy) so the page can say so and
 *            refresh itself; see components/pwa/offline-banner.tsx. Staff, account and
 *            checkpoint pages aren't kept: those just wait for the network.
 * Never touched: other origins, non-GET (Server Action POSTs), /api/*, event
 * streams, RSC payloads (RSC: 1 or ?_rsc=), /files/<id>/original, range requests.
 *
 * Also
 *   sync                     flushes the offline submission queue (lib/offline/queue.ts)
 *   push                     shows the notification the server sent (lib/push.ts payloads)
 *   notificationclick        brings forward a window showing that page, or moves the best
 *                            window there in-app (message OPEN), or opens one
 *   pushsubscriptionchange   re-subscribes and tells the server
 *   message SKIP_WAITING     activates a waiting update when the page asks (the "Reload" button)
 *   message PURGE            forgets saved pages and photos (leaving a team, signing out;
 *                            components/pwa/forget.ts)
 */
import { flushQueue, QUEUE_SYNC_TAG } from "@/lib/offline/queue";
import { forgetSavedCopies } from "@/lib/platform/saved-copies";
import {
  CACHE,
  freshPageVerdict,
  keepsSavedCopy,
  mediaBucket,
  OFFLINE_REASON_ATTR,
  type OfflineReason,
  pageTitle,
  pickWindow,
  SAVED_AT_HEADER,
  SAVED_COPY_ATTR,
  SAVED_REASON_ATTR,
  SAVED_TITLE_HEADER,
  type SavedReason,
  withHtmlAttribute,
} from "@/lib/platform/sw-policy";

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
const VERSION = "2026-09-28.2";
const SHELL = `${CACHE.shellPrefix}${VERSION}`;
const PAGES = `${CACHE.pagesPrefix}${VERSION}`;
/** Content-addressed or keyed by file id, so these survive updates (trimmed by count instead). */
const CURRENT = new Set<string>([SHELL, PAGES, CACHE.static, CACHE.media, CACHE.gallery]);

const OFFLINE_URL = "/offline";
/** Besides the offline page's own files: the notification icon and badge, and the offline page's mascot. */
const SHELL_ASSETS = ["/icons/icon-192.png", "/icons/badge-96.png", "/brand/hedgehog-192.png"];

/** A navigation slower than this shows the saved copy of the page, if there is one… */
const NAV_TIMEOUT_MS = 4000;
/** …and with no saved copy, the offline page once the network has had this long in total. */
const NAV_GIVE_UP_MS = 15_000;
/** What a reverse proxy answers while the app restarts. */
const GATEWAY_ERROR = new Set([502, 503, 504]);
const MEDIA_LIMIT = 300;
const GALLERY_LIMIT = 150;
const PAGES_LIMIT = 60;
const STATIC_LIMIT = 500;
/** Trims wait this long, so a burst of puts (a page of thumbnails) is trimmed once. */
const TRIM_DELAY_MS = 2000;
/** How long a page gets to answer "OPEN" from a notification tap before the worker navigates it. */
const OPEN_ANSWER_MS = 1500;

/** When saved copies were last forgotten: responses to requests started before then aren't saved. */
let purgedAt = 0;

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
  const data = event.data as { type?: string; huntSlug?: unknown } | null;
  if (data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  } else if (data?.type === "PURGE") {
    purgedAt = Date.now();
    event.waitUntil(forgetSavedCopies(typeof data.huntSlug === "string" ? data.huntSlug : null).catch(noop));
  }
});

/** The offline page and everything it needs to render, plus the notification icons. */
async function precacheShell(): Promise<void> {
  const cache = await caches.open(SHELL);
  // The offline page must be this version's, so it skips the HTTP cache…
  const page = await fetch(OFFLINE_URL, { cache: "reload", credentials: "omit" });
  if (!page.ok) throw new Error(`Couldn't precache ${OFFLINE_URL} (${page.status})`);
  const html = await page.clone().text();
  await cache.put(OFFLINE_URL, page);

  // …while its chunks and fonts are content-hashed, and the icons revalidate: whatever the
  // HTTP cache already holds from the page that registered this worker is right.
  const assets = new Set<string>(SHELL_ASSETS);
  for (const url of staticUrls(html)) assets.add(url);
  const fetched = await Promise.all(
    [...assets].map(async (url) => {
      try {
        const res = await fetch(url);
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
        const res = await fetch(url);
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
    event.respondWith(mediaAsset(event, url));
  }
});

/**
 * Network first. A slow network with a saved copy shows the copy (the network still
 * refreshes it in the background); with no copy it keeps waiting until NAV_GIVE_UP_MS,
 * then shows the offline page, whose "Try again" reloads this address. Pages that are
 * never saved just wait for the network, and show the offline page only if it fails.
 */
async function navigation(event: FetchEvent, url: URL): Promise<Response> {
  const keep = keepsSavedCopy(url.pathname);
  const key = url.origin + url.pathname + url.search;
  const started = Date.now();

  const network = (async () => {
    const preloaded = (await event.preloadResponse) as Response | undefined;
    const response = preloaded ?? (await fetch(event.request));
    if (keep) event.waitUntil(rememberPage(key, response.clone(), started).catch(noop));
    return response;
  })();

  if (!keep) {
    try {
      return await network;
    } catch {
      return offlinePage("offline");
    }
  }

  // Whatever happens to the race below, let the request finish (and update the saved copy).
  event.waitUntil(network.then(noop, noop));
  const saved = (reason: SavedReason) => savedCopy(url, key, reason);
  try {
    const first = await Promise.race([network, delay(NAV_TIMEOUT_MS)]);
    // The proxy answers 502–504 while the app restarts: the last copy beats an error page.
    if (first) return GATEWAY_ERROR.has(first.status) ? ((await saved("unavailable")) ?? first) : first;
    const copy = await saved("slow");
    if (copy) return copy;
    const late = await Promise.race([network, delay(NAV_GIVE_UP_MS - NAV_TIMEOUT_MS)]);
    return late ?? (await offlinePage("slow"));
  } catch {
    return (await saved("offline")) ?? (await offlinePage("offline"));
  }
}

/**
 * Brings the saved copy of a page in line with a fresh response: replaced by a normal
 * page, deleted when the page is gone for this device (not found, redirected away),
 * left alone after a server error. See freshPageVerdict.
 */
async function rememberPage(key: string, response: Response, started: number): Promise<void> {
  const contentType = response.headers.get("content-type");
  const readable = response.status === 200 && response.type === "basic" && /^text\/html\b/i.test(contentType ?? "");
  const html = readable ? await response.text() : null;
  const verdict = freshPageVerdict({ status: response.status, type: response.type, contentType }, html);
  // A "forget this device" (leaving a team, signing out) happened while this was loading.
  if (verdict === "skip" || started < purgedAt) return;
  const cache = await caches.open(PAGES);
  if (verdict === "forget" || html == null) {
    await cache.delete(key);
    return;
  }
  const title = pageTitle(html);
  const copy = htmlResponse(html, response, {
    [SAVED_AT_HEADER]: new Date().toISOString(),
    ...(title ? { [SAVED_TITLE_HEADER]: encodeURIComponent(title) } : {}),
  });
  await cache.put(key, copy);
  if (started < purgedAt) await cache.delete(key);
  await trimSoon(PAGES, PAGES_LIMIT);
}

/** The saved copy of a page, marked for the page to notice; for launch URLs like /?source=pwa, the page without the query. */
async function savedCopy(url: URL, key: string, reason: SavedReason): Promise<Response | undefined> {
  const cache = await caches.open(PAGES);
  const hit =
    (await cache.match(key, { ignoreVary: true })) ??
    (url.search ? await cache.match(url.origin + url.pathname, { ignoreVary: true }) : undefined);
  if (!hit) return undefined;
  let html = await hit.text();
  html = withHtmlAttribute(html, SAVED_REASON_ATTR, reason);
  html = withHtmlAttribute(html, SAVED_COPY_ATTR, hit.headers.get(SAVED_AT_HEADER) ?? "");
  return htmlResponse(html, hit);
}

/** The precached offline page, marked with why it's showing (no connection, or a very slow one). */
async function offlinePage(reason: OfflineReason): Promise<Response> {
  const page = await caches.match(OFFLINE_URL);
  if (!page) return offlineFallback();
  return htmlResponse(withHtmlAttribute(await page.text(), OFFLINE_REASON_ATTR, reason), page);
}

/**
 * Page HTML as a new response with the original's status and headers, less the ones that
 * described its old body: the text here is already decoded, whatever the server compressed.
 */
function htmlResponse(html: string, from: Response, extra: Record<string, string> = {}): Response {
  const headers = new Headers(from.headers);
  for (const name of ["content-encoding", "content-length", "transfer-encoding"]) headers.delete(name);
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return new Response(html, { status: from.status, statusText: from.statusText, headers });
}

/** Hashed build assets: cache-first. Dev-server chunks aren't immutable, so they're never stored. */
async function staticAsset(event: FetchEvent): Promise<Response> {
  const { request } = event;
  const cache = await caches.open(CACHE.static);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic" && /immutable/.test(response.headers.get("cache-control") ?? "")) {
      const copy = response.clone();
      event.waitUntil(
        cache
          .put(request, copy)
          .then(() => trimSoon(CACHE.static, STATIC_LIMIT))
          .catch(noop),
      );
    }
    return response;
  } catch {
    // Offline: the offline page's own assets live in the shell cache.
    return (await caches.match(request)) ?? Response.error();
  }
}

/** Photos, images and fonts: cache-first, kept in the cache the requesting page calls for. */
async function mediaAsset(event: FetchEvent, url: URL): Promise<Response> {
  const { request } = event;
  const hit = await caches.match(request);
  if (hit) return hit;
  const started = Date.now();
  try {
    const response = await fetch(request);
    if (response.status === 200 && response.type === "basic") {
      event.waitUntil(keepMedia(event.clientId, url, request, response.clone(), started).catch(noop));
    }
    return response;
  } catch {
    return Response.error();
  }
}

async function keepMedia(
  clientId: string,
  url: URL,
  request: Request,
  response: Response,
  started: number,
): Promise<void> {
  const client = clientId ? await self.clients.get(clientId) : undefined;
  const bucket = mediaBucket(url.pathname, client ? new URL(client.url).pathname : null);
  if (!bucket || started < purgedAt) return;
  const name = bucket === "gallery" ? CACHE.gallery : CACHE.media;
  const cache = await caches.open(name);
  await cache.put(request, response);
  if (started < purgedAt) await cache.delete(request);
  await trimSoon(name, bucket === "gallery" ? GALLERY_LIMIT : MEDIA_LIMIT);
}

const pendingTrims = new Map<string, Promise<void>>();

/** Trims a cache shortly, once for a whole burst of puts rather than once per put. */
function trimSoon(name: string, max: number): Promise<void> {
  let pending = pendingTrims.get(name);
  if (!pending) {
    pending = delay(TRIM_DELAY_MS).then(() => {
      pendingTrims.delete(name);
      return trim(name, max);
    });
    pendingTrims.set(name, pending);
  }
  return pending;
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
  let target: URL;
  try {
    target = new URL(raw, self.location.origin);
  } catch {
    target = new URL("/", self.location.origin);
  }
  if (target.origin !== self.location.origin) target = new URL("/", self.location.origin);
  event.waitUntil(openFromNotification(target));
});

/**
 * A window already on that page comes forward as it is. Otherwise the best window
 * (same hunt first; see pickWindow) is asked to move there in-app, which keeps an
 * upload in progress or feedback being typed elsewhere in the app; a page that
 * doesn't answer is navigated (controlled windows only), else a window opens.
 */
async function openFromNotification(target: URL): Promise<unknown> {
  const [windows, controlled] = await Promise.all([
    self.clients.matchAll({ type: "window", includeUncontrolled: true }),
    self.clients.matchAll({ type: "window" }),
  ]);
  const controlledIds = new Set(controlled.map((c) => c.id));
  const choice = pickWindow(
    windows.map((w) => ({
      id: w.id,
      url: w.url,
      visible: w.visibilityState === "visible",
      focused: w.focused,
      controlled: controlledIds.has(w.id),
    })),
    target,
  );
  const client = choice ? windows.find((w) => w.id === choice.id) : undefined;
  if (choice && client) {
    const focused = (await client.focus().catch(() => null)) ?? client;
    if (!choice.open) return focused;
    if (await askToOpen(focused, target)) return focused;
    if (controlledIds.has(client.id)) {
      const navigated = await focused.navigate(target.href).catch(() => null);
      if (navigated) return navigated;
    }
  }
  return self.clients.openWindow(target.href);
}

/** Asks a page to go to `target` itself (components/pwa/sw-register.tsx); false if it doesn't answer. */
function askToOpen(client: WindowClient, target: URL): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), OPEN_ANSWER_MS);
    channel.port1.onmessage = () => {
      clearTimeout(timer);
      resolve(true);
    };
    try {
      client.postMessage({ type: "OPEN", url: target.pathname + target.search + target.hash }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
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
