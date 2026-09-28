/*
 * What the service worker keeps on the device, and where a notification tap
 * lands. Pure rules shared by the worker (sw/index.ts), the offline page and
 * the "forget this device's copies" helper — no DOM or worker globals here
 * (see sw-policy.test.ts).
 */

/** Cache names. Saved pages carry the worker version (sw/index.ts); media survives updates. */
export const CACHE = {
  shellPrefix: "shp-shell-",
  pagesPrefix: "shp-pages-",
  static: "shp-static",
  /** Photos and images the player's own pages use: task attachments, the team's photos, terrain. */
  media: "shp-media",
  /** Photos seen while browsing the gallery or the big screen, capped on their own. */
  gallery: "shp-gallery",
} as const;

/** Headers the worker adds to a saved page: when it was saved, and its <title> (URI-encoded). */
export const SAVED_AT_HEADER = "x-shp-saved-at";
export const SAVED_TITLE_HEADER = "x-shp-title";

/**
 * Attributes the worker puts on <html> when it answers with something other
 * than a fresh page, read by the page once it loads (components/pwa):
 *   data-saved-copy="<ISO time>"          a saved copy of the page (time it was saved, or empty)
 *   data-saved-reason="slow|offline|unavailable"
 *                                         why: the network was slow, failed, or the server
 *                                         answered 502–504 (restarting)
 *   data-offline-reason="offline|slow"    on the offline page: no connection, or no saved copy
 *                                         and the network still hadn't answered
 */
export const SAVED_COPY_ATTR = "data-saved-copy";
export const SAVED_REASON_ATTR = "data-saved-reason";
export const OFFLINE_REASON_ATTR = "data-offline-reason";
export type SavedReason = "slow" | "offline" | "unavailable";
export type OfflineReason = "offline" | "slow";

// Pages --------------------------------------------------------------------------------

/** Staff and account pages: little use offline, and not wanted lying around on a shared phone. */
const STAFF_OR_ACCOUNT = /^\/(login|signup|setup|invite|admin|manage|dashboard)(\/|$)/;
/** Opening a checkpoint link punches the checkpoint, so a saved copy would punch again. */
const CHECKPOINT = /^\/h\/[^/]+\/cp(\/|$)/;
/** The projector view: it updates itself and nobody is there to use a notification. */
const KIOSK = /^\/h\/[^/]+\/screen(\/|$)/;

/** Whether the worker keeps a copy of this page for offline use. */
export function keepsSavedCopy(pathname: string): boolean {
  return !STAFF_OR_ACCOUNT.test(pathname) && !CHECKPOINT.test(pathname) && !/^\/offline(\/|$)/.test(pathname);
}

/**
 * What a fresh response means for the saved copy of a page:
 *   save    a normal page: it replaces the saved copy
 *   forget  the page is gone for this device (not found, no longer allowed, redirected
 *           elsewhere): delete the saved copy, so it can't be shown offline later
 *   skip    a server error or something that isn't a page: keep the old copy as it is
 * Pages with a loading.tsx stream, so they answer 200 even when they end in notFound(),
 * redirect() or an error; React marks those with <template data-dgst="…">.
 */
export function freshPageVerdict(
  response: { status: number; type: string; contentType: string | null },
  html: string | null,
): "save" | "forget" | "skip" {
  if (response.type === "opaqueredirect" || [401, 403, 404, 410].includes(response.status)) return "forget";
  if (response.status !== 200 || response.type !== "basic") return "skip";
  if (!/^text\/html\b/i.test(response.contentType ?? "") || html == null) return "skip";
  const digest = streamedDigest(html);
  if (digest == null) return "save";
  return /^NEXT_(REDIRECT|HTTP_ERROR_FALLBACK)\b/.test(digest) ? "forget" : "skip";
}

/** The error digest of a page that ended in notFound(), redirect() or an error while streaming. */
export function streamedDigest(html: string): string | null {
  return /<template data-dgst="([^"]*)"/.exec(html)?.[1] ?? null;
}

/** The page's <title>, with the entities React escapes decoded. */
export function pageTitle(html: string): string | null {
  const raw = /<title(?:\s[^>]*)?>([^<]*)<\/title>/i.exec(html)?.[1];
  if (raw == null) return null;
  const text = raw
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
  return text || null;
}

/** Adds an attribute to the page's <html> element (the page reads it once it loads). */
export function withHtmlAttribute(html: string, name: string, value: string): string {
  const escaped = value.replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`);
  return html.replace(/<html(?=[\s>])/i, `<html ${name}="${escaped}"`);
}

// Media ----------------------------------------------------------------------------------

/**
 * Which cache a fetched image or font goes into, from the page that asked for it:
 *   gallery   photos seen in the gallery or on the big screen — capped on their own, so
 *             scrolling hundreds of photos can't push out the ones a player needs offline
 *   media     everything else players see: task attachments, the team's own photos,
 *             hunt terrain, icons
 *   null      photos on staff pages (the judging queue shows other teams' photos before
 *             they're judged): not kept on the device
 * Only /files/… are private uploads; terrain, icons and fonts are public and always kept.
 */
export function mediaBucket(path: string, pagePath: string | null): "media" | "gallery" | null {
  if (!path.startsWith("/files/")) return "media";
  if (pagePath == null || STAFF_OR_ACCOUNT.test(pagePath)) return null;
  if (/^\/h\/[^/]+\/gallery(\/|$)/.test(pagePath) || KIOSK.test(pagePath)) return "gallery";
  return "media";
}

/** Which saved pages "forget this hunt" removes: the hunt's pages and the home page (its "Your hunts" list). */
export function belongsToHunt(pathname: string, huntSlug: string): boolean {
  return pathname === "/" || pathname === `/h/${huntSlug}` || pathname.startsWith(`/h/${huntSlug}/`);
}

// Notification taps -----------------------------------------------------------------------

export type WindowInfo = {
  id: string;
  url: string;
  visible: boolean;
  focused: boolean;
  /** Controlled by this worker (only those can be navigated from the worker). */
  controlled: boolean;
};

/** The part of the app a page belongs to: "/h/<slug>", "/manage/<huntId>", or its first segment. */
export function appArea(pathname: string): string {
  const [, first = "", second = ""] = pathname.split("/");
  return first === "h" || first === "manage" ? `/${first}/${second}` : `/${first}`;
}

/**
 * The window a notification tap should use:
 *   { open: false }   a window already shows that page: just bring it forward
 *   { open: true }    move this window to the page (in-app, so uploads and typed text
 *                     elsewhere in the app aren't lost to a reload)
 *   null              open a new window
 * A window on the same hunt (or the same hunt's staff pages) is preferred, then any
 * visible one; the big screen is never taken over.
 */
export function pickWindow(windows: WindowInfo[], target: URL): { id: string; open: boolean } | null {
  const rank = (w: WindowInfo) => (w.controlled ? 4 : 0) + (w.focused ? 2 : 0) + (w.visible ? 1 : 0);
  const best = (list: WindowInfo[]) => [...list].sort((a, b) => rank(b) - rank(a))[0];
  const sameOrigin = windows.flatMap((w) => {
    try {
      const url = new URL(w.url);
      return url.origin === target.origin ? [{ w, path: url.pathname }] : [];
    } catch {
      return [];
    }
  });
  const there = sameOrigin.filter((c) => c.path === target.pathname).map((c) => c.w);
  if (there.length > 0) return { id: best(there).id, open: false };

  const usable = sameOrigin.filter((c) => !KIOSK.test(c.path));
  const area = appArea(target.pathname);
  const pick =
    best(usable.filter((c) => appArea(c.path) === area).map((c) => c.w)) ??
    best(usable.filter((c) => c.w.visible).map((c) => c.w));
  return pick ? { id: pick.id, open: true } : null;
}
