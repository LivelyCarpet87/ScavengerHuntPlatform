"use client";

import { CloudOff } from "lucide-react";
import { useOffline } from "next/offline";

/**
 * Shown across the app while the device can't reach the server. Navigations
 * and Server Actions wait and retry automatically (experimental.useOffline);
 * photo uploads are queued on the device (see lib/offline).
 */
export function OfflineBanner() {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <output className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-ink px-4 py-2 pt-safe text-sm font-medium text-paper">
      <CloudOff aria-hidden className="size-4 shrink-0" />
      <span>No connection. Anything you submit is saved and sent when you’re back online.</span>
    </output>
  );
}
