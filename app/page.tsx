import { YourHunts } from "@/components/home/your-hunts";
import { CodeHero } from "@/components/join/code-hero";
import { SiteHeader } from "@/components/shells/site-header";
import { AccountMenu } from "@/components/staff/account-menu";
import { ButtonLink } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { getDeviceHunts } from "@/lib/player/queries";

/**
 * The front door: type the hunt code, jump back into your hunts, or head to
 * the organizer tools. While one of this device's hunts is live, getting back
 * to it comes first and the code entry steps back to "Join another hunt".
 */
export default async function Home() {
  const [hunts, user] = await Promise.all([getDeviceHunts(), getCurrentUser()]);
  const live = hunts.some((h) => h.phase === "live");
  return (
    <>
      <SiteHeader>
        {user ? <AccountMenu name={user.name} email={user.email} isAdmin={user.isAdmin} /> : null}
      </SiteHeader>
      <main className="pb-16">
        {live ? (
          <>
            <YourHunts hunts={hunts} leading />
            <CodeHero title="Join another hunt" secondary className="mt-10 border-t" />
          </>
        ) : (
          <>
            <CodeHero />
            <YourHunts hunts={hunts} />
          </>
        )}
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
              {user ? "Open your hunts" : "Sign in to organize"}
            </ButtonLink>
          </div>
        </section>
      </main>
    </>
  );
}
