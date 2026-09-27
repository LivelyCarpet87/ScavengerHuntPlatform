import Link from "next/link";
import { ResumeBar } from "@/components/home/resume-bar";
import { YourHunts } from "@/components/home/your-hunts";
import { CodeHero } from "@/components/join/code-hero";
import { SiteHeader } from "@/components/shells/site-header";
import { ButtonLink } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { getDeviceHunts } from "@/lib/player/queries";

/** The front door: type the hunt code, jump back into your hunts, or head to the organizer tools. */
export default async function Home() {
  const [hunts, user] = await Promise.all([getDeviceHunts(), getCurrentUser()]);
  const live = hunts.find((h) => h.phase === "live");
  return (
    <>
      <SiteHeader>
        {user ? (
          <Link
            href="/dashboard"
            className="rounded-md px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-mist hover:text-ink"
          >
            Your dashboard
          </Link>
        ) : null}
      </SiteHeader>
      {live ? <ResumeBar entry={live} /> : null}
      <main className="pb-16">
        <CodeHero />
        <YourHunts hunts={hunts} />
        <section aria-labelledby="organize" className="mx-auto mt-12 max-w-xl px-4">
          <div className="flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 id="organize" className="font-cond text-xl font-bold tracking-tight">
                Running a hunt?
              </h2>
              <p className="mt-1 max-w-sm text-sm text-ink-2">
                Set out tasks, judge the photos as they arrive and put a live scoreboard on the big screen.
              </p>
            </div>
            <ButtonLink href={user ? "/dashboard" : "/login"} variant="secondary" className="self-start sm:self-center">
              {user ? "Open your dashboard" : "Sign in to organize"}
            </ButtonLink>
          </div>
        </section>
      </main>
    </>
  );
}
