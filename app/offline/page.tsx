import { CloudUpload, RotateCcwClock, Trophy } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { OfflineRetry, SavedPagesList } from "@/components/pwa/offline-recovery";
import { ReloadButton } from "@/components/pwa/reload-button";
import { SiteHeader } from "@/components/shells/site-header";
import { Mascot } from "@/components/ui/mascot";

/*
 * Shown by the service worker when a page can't load and there's no saved copy
 * of it: no connection, or (data-offline-reason="slow" on <html>) a connection
 * so slow the page still hadn't arrived. Fully static (no database, no cookies)
 * so it can be precached at install — keep it that way.
 */
export const dynamic = "force-static";
export const metadata: Metadata = { title: "Offline", robots: { index: false } };

function Works({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-water">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

/** Which of the two versions of a line shows: the default (no connection), or the slow one. */
const OFFLINE_ONLY = "in-data-[offline-reason=slow]:hidden";
const SLOW_ONLY = "hidden in-data-[offline-reason=slow]:block";

export default function OfflinePage() {
  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex max-w-md flex-col items-center px-4 pt-12 pb-20 text-center outline-none"
      >
        <Mascot size={112} />
        <h1 className={`mt-6 font-cond text-5xl font-extrabold tracking-tight ${OFFLINE_ONLY}`}>You're offline</h1>
        <h1 className={`mt-6 font-cond text-5xl font-extrabold tracking-tight ${SLOW_ONLY}`}>Still loading</h1>
        <p className={`mt-3 text-ink-2 ${OFFLINE_ONLY}`}>
          This page needs a connection. Move somewhere with better signal: it opens by itself once you're back online.
        </p>
        <p className={`mt-3 text-ink-2 ${SLOW_ONLY}`}>
          The connection is very slow and this page hasn't arrived yet. It opens by itself once it can.
        </p>
        <ReloadButton size="lg" className="mt-7 w-full sm:w-auto">
          Try again
        </ReloadButton>
        <OfflineRetry />

        <section className="mt-12 w-full rounded-lg bg-mist p-5 text-left">
          <h2 className="font-semibold">What still works</h2>
          <ul className="mt-3 flex flex-col gap-3 text-sm text-ink-2">
            <Works icon={<CloudUpload aria-hidden className="size-5" />}>
              Photos you submit are saved on your phone and sent when you're back online.
            </Works>
            <Works icon={<RotateCcwClock aria-hidden className="size-5" />}>
              <p>Pages you opened recently still open, showing what they said last time.</p>
              <SavedPagesList />
            </Works>
            <Works icon={<Trophy aria-hidden className="size-5" />}>
              Scores and judges' decisions catch up the moment you reconnect.
            </Works>
          </ul>
        </section>
      </main>
    </div>
  );
}
