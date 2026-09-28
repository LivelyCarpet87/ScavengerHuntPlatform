"use client";

import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { captureInstallPrompt, promptInstall, useInstallState, useIosStepsClaimed } from "./install-state";
import { IosInstallSteps } from "./ios-install-steps";
import { isIOS, isStandalone, safeStorage } from "./platform";

const DISMISS_KEY = "shp-install-dismissed";
const DISMISS_FOR_MS = 30 * 24 * 60 * 60 * 1000;

type Mode = "hidden" | "ios" | "prompt";

/**
 * "Install the app" affordance. Android and desktop Chromium get a button that
 * opens the browser's install dialog; iPhone and iPad get the real steps
 * (Share, then Add to Home Screen). Renders nothing when the app is already
 * installed, the browser can't install it, or the person said "Not now"
 * (remembered for 30 days on this device).
 */
export function InstallPrompt({ className }: { className?: string }) {
  const { event, installed } = useInstallState();
  const stepsShownElsewhere = useIosStepsClaimed();
  const [base, setBase] = useState<"unknown" | "standalone" | "ios" | "browser">("unknown");
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    captureInstallPrompt();
    const at = Number(safeStorage.get(DISMISS_KEY) ?? 0);
    setDismissed(Date.now() - at < DISMISS_FOR_MS);
    setBase(isStandalone() ? "standalone" : isIOS() ? "ios" : "browser");
  }, []);

  const mode: Mode =
    base === "unknown" || base === "standalone" || installed || dismissed
      ? "hidden"
      : base === "ios"
        ? stepsShownElsewhere
          ? "hidden"
          : "ios"
        : event
          ? "prompt"
          : "hidden";
  if (mode === "hidden") return null;

  const dismiss = () => {
    safeStorage.set(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  return (
    <aside
      aria-label="Install the app"
      className={cn("relative flex items-start gap-4 rounded-lg border border-line bg-paper p-4 pr-12", className)}
    >
      {/* biome-ignore lint/performance/noImgElement: the app's own icon, shown as it will look on the home screen */}
      <img
        src="/icons/maskable-192.png"
        width={52}
        height={52}
        alt=""
        className="size-13 shrink-0 rounded-[28%]"
        draggable={false}
      />
      <div className="min-w-0 flex-1">
        {mode === "prompt" ? (
          <>
            <p className="font-semibold">Keep the hunt one tap away</p>
            <p className="mt-0.5 text-sm text-ink-2">
              Install the app to open it from your home screen, full screen, like any other app.
            </p>
            <Button
              className="mt-3"
              pending={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await promptInstall();
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Download aria-hidden />
              Install the app
            </Button>
          </>
        ) : (
          <>
            <p className="font-semibold">Add the app to your Home Screen</p>
            <p className="mt-0.5 text-sm text-ink-2">
              It opens full screen, and on iPhone it's the only way to get notifications about your results.
            </p>
            <IosInstallSteps className="mt-3" />
          </>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        title="Not now"
        className="absolute top-1.5 right-1.5 grid size-11 place-items-center rounded-md text-ink-2 hover:bg-mist hover:text-ink"
      >
        <X aria-hidden className="size-5" />
      </button>
    </aside>
  );
}
