"use client";

import { RotateCw, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { requestBackgroundSync } from "@/lib/offline/background-sync";
import { listQueued } from "@/lib/offline/queue";
import { captureInstallPrompt } from "./install-state";
import { safeStorage } from "./platform";

// Keep `beforeinstallprompt` for <InstallPrompt>, however late it mounts. This module
// loads with the root layout, early enough to catch the event.
captureInstallPrompt();

/** How often an open app checks for a new version while it's in use. */
const UPDATE_CHECK_MS = 30 * 60 * 1000;
/** The projector view updates itself; nobody is there to tap "Reload". */
const KIOSK = /^\/h\/[^/]+\/screen(\/|$)/;

/** Activates a waiting worker; the page reloads once it takes control. */
function activate(worker: ServiceWorker, reloadRequested: { current: boolean }) {
  reloadRequested.current = true;
  worker.postMessage({ type: "SKIP_WAITING" });
  // If the new worker had already taken over from another tab, controllerchange won't fire here.
  setTimeout(() => window.location.reload(), 4000);
}

async function syncIfQueued() {
  try {
    if ((await listQueued()).length > 0) await requestBackgroundSync();
  } catch {
    // No IndexedDB or no Background Sync: the page's own queue flusher covers it.
  }
}

/**
 * Registers the service worker (built from sw/ into /sw.js) in production, or
 * in development when localStorage "sw-dev" is set. When a new version has
 * installed and is waiting, offers "Reload", which activates it (SKIP_WAITING)
 * and reloads once it has taken over. Also asks for a Background Sync when the
 * phone comes back online with submissions still queued.
 */
export function ServiceWorkerRegistrar() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const reloadRequested = useRef(false);
  const pathname = usePathname();
  const kiosk = KIOSK.test(pathname ?? "");

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && !safeStorage.get("sw-dev")) return;

    let registration: ServiceWorkerRegistration | null = null;
    let lastCheck = Date.now();
    const checkForUpdate = () => {
      if (!registration) return;
      lastCheck = Date.now();
      void registration.update().catch(() => undefined);
    };

    // Only reload when the person asked for it; the first install also changes the controller.
    const onControllerChange = () => {
      if (reloadRequested.current) window.location.reload();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheck > UPDATE_CHECK_MS) checkForUpdate();
    };
    const onOnline = () => void syncIfQueued();

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") checkForUpdate();
    }, UPDATE_CHECK_MS);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        registration = reg;
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const incoming = reg.installing;
          incoming?.addEventListener("statechange", () => {
            if (incoming.state === "installed" && navigator.serviceWorker.controller) setWaiting(incoming);
          });
        });
        void syncIfQueued();
      })
      .catch((err) => console.warn("Service worker registration failed", err));

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (waiting && kiosk) activate(waiting, reloadRequested);
  }, [waiting, kiosk]);

  if (!waiting || dismissed || kiosk) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.25rem)] z-[65] flex justify-center px-4">
      <output className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg bg-raised py-2.5 pr-2 pl-4 text-ink shadow-pop animate-pop">
        <RotateCw aria-hidden className="size-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 font-semibold">A new version is ready</span>
        <Button size="sm" onClick={() => activate(waiting, reloadRequested)}>
          Reload
        </Button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Later"
          title="Later"
          className="grid size-9 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-mist hover:text-ink"
        >
          <X aria-hidden className="size-4" />
        </button>
      </output>
    </div>
  );
}
