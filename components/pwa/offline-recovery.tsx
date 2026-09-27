"use client";

import { MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { listSavedPages, type SavedPage } from "@/lib/platform/saved-copies";
import { serverAnswers } from "./reachability";

/** How often the offline page checks whether the page it stands in for can load now. */
const RETRY_EVERY_MS = 20_000;
const SAVED_LINKS = 6;
const CHECKPOINT = /^\/h\/[^/]+\/cp\/[^/]+/;

/**
 * On the offline page (which the service worker shows in place of the page
 * that couldn't load): loads that page by itself once the server answers —
 * when the phone comes back online, when the app returns to the foreground,
 * and every RETRY_EVERY_MS while it's on screen. For a checkpoint link, says
 * the punch is waiting for that.
 */
export function OfflineRetry() {
  const [checkpoint, setCheckpoint] = useState(false);

  useEffect(() => {
    // Opened as /offline itself (not in place of another page): nothing to load.
    if (window.location.pathname === "/offline") return;
    setCheckpoint(CHECKPOINT.test(window.location.pathname));
    let busy = false;
    const retry = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      if (await serverAnswers()) window.location.reload();
      busy = false;
    };
    const onVisibility = () => void retry();
    const onOnline = () => void retry();
    const timer = setInterval(() => void retry(), RETRY_EVERY_MS);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (!checkpoint) return null;
  return (
    <p className="mt-6 flex items-start gap-3 rounded-lg bg-sun-wash p-4 text-left text-sm text-ink">
      <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-sun-fg" />
      <span>
        <span className="font-semibold">This checkpoint isn’t punched yet.</span> Keep this page open: it punches by
        itself as soon as you’re back online.
      </span>
    </p>
  );
}

/** "Campus Night Hunt – Scavenger" → "Campus Night Hunt", using the app name from this page's own title. */
function label(page: SavedPage, appSuffix: string | null): string {
  if (page.pathname === "/") return "Home";
  const title = page.title?.trim();
  if (!title) return page.pathname;
  return appSuffix && title.endsWith(appSuffix) && title !== appSuffix ? title.slice(0, -appSuffix.length) : title;
}

function huntOf(pathname: string): string | null {
  return /^\/h\/([^/]+)/.exec(pathname)?.[1] ?? null;
}

/**
 * Links to the pages saved on this phone, which open offline (plain links: the
 * service worker answers them with the saved copy). The current hunt's pages
 * come first, then the most recently saved.
 */
export function SavedPagesList() {
  const [pages, setPages] = useState<{ href: string; text: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    const here = window.location.pathname;
    const hunt = huntOf(here);
    // This page's own title is "Offline – <app name>".
    const parts = document.title.split(" – ");
    const appSuffix = parts.length > 1 ? ` – ${parts[parts.length - 1]}` : null;
    listSavedPages()
      .then((saved) => {
        if (cancelled) return;
        const others = saved.filter((p) => p.pathname !== here);
        const ordered = hunt
          ? [...others.filter((p) => huntOf(p.pathname) === hunt), ...others.filter((p) => huntOf(p.pathname) !== hunt)]
          : others;
        const seen = new Set<string>();
        const links: { href: string; text: string }[] = [];
        for (const page of ordered) {
          if (seen.has(page.pathname)) continue;
          seen.add(page.pathname);
          links.push({ href: page.href, text: label(page, appSuffix) });
          if (links.length === SAVED_LINKS) break;
        }
        setPages(links);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (pages.length === 0) return null;
  return (
    <ul aria-label="Saved on this phone" className="mt-2 flex flex-col">
      {pages.map((page) => (
        <li key={page.href}>
          {/* A plain link on purpose: the service worker answers it with the saved copy. */}
          <a
            href={page.href}
            className="flex min-h-11 items-center font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            {page.text}
          </a>
        </li>
      ))}
    </ul>
  );
}
