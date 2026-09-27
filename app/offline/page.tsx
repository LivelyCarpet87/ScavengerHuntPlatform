import { CloudUpload, RotateCcwClock, Trophy } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ReloadButton } from "@/components/pwa/reload-button";
import { SiteHeader } from "@/components/shells/site-header";
import { Mascot } from "@/components/ui/mascot";

/*
 * Shown by the service worker when a page can't load and there's no saved copy
 * of it. Fully static (no database, no cookies) so it can be precached at
 * install — keep it that way.
 */
export const dynamic = "force-static";
export const metadata: Metadata = { title: "Offline", robots: { index: false } };

function Works({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-water">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

export default function OfflinePage() {
  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader />
      <main className="mx-auto flex max-w-md flex-col items-center px-4 pt-12 pb-20 text-center">
        <Mascot size={112} />
        <h1 className="mt-6 font-cond text-5xl font-extrabold tracking-tight">You're offline</h1>
        <p className="mt-3 text-ink-2">
          This page needs a connection. Move somewhere with better signal, then try again.
        </p>
        <ReloadButton size="lg" className="mt-7 w-full sm:w-auto">
          Try again
        </ReloadButton>

        <section className="mt-12 w-full rounded-lg bg-mist p-5 text-left">
          <h2 className="font-semibold">What still works</h2>
          <ul className="mt-3 flex flex-col gap-3 text-sm text-ink-2">
            <Works icon={<CloudUpload aria-hidden className="size-5" />}>
              Photos you submit are saved on your phone and sent when you're back online.
            </Works>
            <Works icon={<RotateCcwClock aria-hidden className="size-5" />}>
              Pages you opened recently still open, showing what they said last time.
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
