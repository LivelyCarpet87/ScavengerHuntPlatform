"use client";

import { CloudOff } from "lucide-react";
import { useOffline } from "next/offline";
import { useEffect, useState } from "react";

/**
 * Shown across the app while the device can't reach the server. Navigations
 * and Server Actions wait and retry automatically (experimental.useOffline);
 * photo uploads are queued on the device (see lib/offline).
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

  if (!offline && !openedOffline) return null;
  return (
    <output
      data-offline-banner
      className="sticky top-0 z-[60] flex h-(--banner-h) items-center justify-center gap-2 bg-ink px-4 pt-safe text-sm font-medium text-paper"
    >
      <CloudOff aria-hidden className="size-4 shrink-0" />
      <span className="truncate sm:hidden">Offline. What you submit sends later.</span>
      <span className="hidden truncate sm:inline">
        No connection. Anything you submit is saved and sent when you’re back online.
      </span>
    </output>
  );
}
