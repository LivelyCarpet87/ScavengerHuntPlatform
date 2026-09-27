"use client";

import { CloudOff } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useOffline } from "next/offline";
import { useEffect, useState, useTransition } from "react";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime, formatTime } from "@/lib/format";
import { SAVED_COPY_ATTR, SAVED_REASON_ATTR, type SavedReason } from "@/lib/platform/sw-policy";
import { serverAnswers } from "./reachability";

/** First wait before asking the server again, doubling up to MAX_RETRY_MS. */
const FIRST_RETRY_MS = 3000;
const MAX_RETRY_MS = 30_000;

type SavedCopy = { savedAt: Date | null; reason: SavedReason };

/**
 * Shown across the app while the device can't reach the server, or while it
 * shows a saved copy of the page. Navigations and Server Actions wait and retry
 * automatically (experimental.useOffline), so a link tapped offline says it's
 * waiting; photo uploads are queued on the device (see lib/offline). A saved
 * copy (the service worker marks it on <html>; see sw/index.ts) says how old
 * it is and is swapped for the live page as soon as the server answers.
 */
export function OfflineBanner() {
  const offline = useOffline();
  // useOffline() notices a failed request or an `offline` event. A page the service worker
  // opened from its saved copy, with no signal at all, has seen neither yet.
  const [openedOffline, setOpenedOffline] = useState(false);
  useEffect(() => {
    if (!navigator.onLine) setOpenedOffline(true);
    const back = () => setOpenedOffline(false);
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, []);
  const noConnection = offline || openedOffline;
  const saved = useSavedCopy();
  const linkWaiting = useLinkWaiting(noConnection);

  let message: { short: string; long: string; updating?: boolean } | null = null;
  if (linkWaiting) {
    message = {
      short: "Offline. Opens once you’re back online.",
      long: "No connection. The page you picked opens as soon as you’re back online.",
    };
  } else if (saved) {
    const when = savedWhen(saved.savedAt);
    const copy = when ? `this page as it was ${when.long}` : "a saved copy of this page";
    if (noConnection || saved.reason === "offline") {
      message = {
        short: when ? `Offline. Page saved ${when.short}.` : "Offline. Showing a saved copy.",
        long: `No connection. Showing ${copy}; it updates when you’re back online.`,
      };
    } else if (saved.reason === "unavailable") {
      message = {
        short: when ? `Can’t reach the hunt. Saved ${when.short}.` : "Can’t reach the hunt. Saved copy.",
        long: `Can’t reach the hunt right now. Showing ${copy}; it updates once the hunt is back.`,
        updating: true,
      };
    } else {
      message = {
        short: when ? `Slow signal. Page saved ${when.short}.` : "Slow signal. Showing a saved copy.",
        long: `Slow connection. Showing ${copy} while the latest version loads.`,
        updating: true,
      };
    }
  } else if (noConnection) {
    message = {
      short: "Offline. Pages and uploads wait for signal.",
      long: "No connection. Pages you open and anything you submit go through when you’re back online.",
    };
  }

  if (!message) return null;
  return (
    <output
      data-offline-banner
      className="sticky top-0 z-[60] flex h-(--banner-h) items-center justify-center gap-2 bg-ink px-4 pt-safe text-sm font-medium text-paper"
    >
      {message.updating ? (
        <Spinner className="size-4 shrink-0" />
      ) : (
        <CloudOff aria-hidden className="size-4 shrink-0" />
      )}
      <span className="truncate sm:hidden">{message.short}</span>
      <span className="hidden truncate sm:inline">{message.long}</span>
    </output>
  );
}

/**
 * When a saved copy was saved, in the phone's time zone and the app's usual formats:
 * "at 12:03" today; "Sat 27 Sep, 12:03" / "on Sat 27 Sep, 12:03" on another day.
 */
function savedWhen(at: Date | null): { short: string; long: string } | null {
  if (!at) return null;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (at.toDateString() === new Date().toDateString()) {
    const time = `at ${formatTime(at, zone)}`;
    return { short: time, long: time };
  }
  const dateTime = formatDateTime(at, zone);
  return { short: dateTime, long: `on ${dateTime}` };
}

/**
 * The saved copy the service worker answered with, if it did: kept until the
 * live page has replaced it. Waits for the server to answer first (with
 * backoff, and right away when the phone comes back online) — refreshing while
 * the server is still down would only load the saved copy again.
 */
function useSavedCopy(): SavedCopy | null {
  const router = useRouter();
  const [copy, setCopy] = useState<SavedCopy | null>(null);
  const [phase, setPhase] = useState<"idle" | "waiting" | "refreshing">("idle");
  const [refreshing, startRefresh] = useTransition();

  useEffect(() => {
    const root = document.documentElement;
    const at = root.getAttribute(SAVED_COPY_ATTR);
    if (at === null) return;
    const savedAt = at ? new Date(at) : null;
    const reason = root.getAttribute(SAVED_REASON_ATTR);
    setCopy({
      savedAt: savedAt && !Number.isNaN(savedAt.getTime()) ? savedAt : null,
      reason: reason === "offline" || reason === "unavailable" ? reason : "slow",
    });
    setPhase("waiting");

    let done = false;
    let probing = false;
    let wait = FIRST_RETRY_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async () => {
      if (done || probing) return;
      clearTimeout(timer);
      probing = true;
      const answers = await serverAnswers();
      probing = false;
      if (done) return;
      if (answers) {
        done = true;
        setPhase("refreshing");
        startRefresh(() => router.refresh());
        return;
      }
      timer = setTimeout(attempt, wait);
      wait = Math.min(wait * 2, MAX_RETRY_MS);
    };
    const onOnline = () => {
      wait = FIRST_RETRY_MS;
      void attempt();
    };
    void attempt();
    window.addEventListener("online", onOnline);
    return () => {
      done = true;
      clearTimeout(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [router]);

  // The live page is in: this is no longer a saved copy.
  useEffect(() => {
    if (phase !== "refreshing" || refreshing) return;
    document.documentElement.removeAttribute(SAVED_COPY_ATTR);
    document.documentElement.removeAttribute(SAVED_REASON_ATTR);
    setCopy(null);
    setPhase("idle");
  }, [phase, refreshing]);

  return copy;
}

/**
 * Whether a link tapped while offline is waiting for the connection: in-app
 * navigations (next/link cancels the browser's own) wait until the phone is
 * back online and give no sign of it otherwise.
 */
function useLinkWaiting(offline: boolean): boolean {
  const pathname = usePathname();
  const [tapped, setTapped] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new page, or the connection back, ends the wait
  useEffect(() => setTapped(false), [pathname, offline]);

  useEffect(() => {
    if (!offline) return;
    const onClick = (event: MouseEvent) => {
      if (!event.defaultPrevented || event.button !== 0) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setTapped(true);
    };
    // After React's own handlers, so next/link has already taken over the click.
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [offline]);

  return offline && tapped;
}
