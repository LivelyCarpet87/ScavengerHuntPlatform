import { CircleCheck, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/shells/site-header";
import { AccountMenu } from "@/components/staff/account-menu";
import { CompactHuntCard, HuntCard, type Leader, LiveHuntCard } from "@/components/staff/hunt-cards";
import { HuntMap } from "@/components/staff/hunt-map";
import { ButtonLink } from "@/components/ui/button";
import { Mascot } from "@/components/ui/mascot";
import { Notice } from "@/components/ui/misc";
import { canCreateHunts, requireUser } from "@/lib/auth/access";
import { huntPhase } from "@/lib/hunts";
import { getStandings } from "@/lib/scoring/service";
import { auditData, type DashboardHunt, listDashboardHunts } from "@/lib/staff/queries";
import { HUNT_TEMPLATES } from "@/lib/templates";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Your hunts" };

async function leaderOf(huntId: string): Promise<Leader> {
  const standings = await getStandings(huntId);
  const top = standings.standings[0];
  if (!top || top.rank !== 1 || top.total <= 0) return null;
  const team = standings.teams[top.teamId];
  return team ? { name: team.name, emoji: team.emoji, color: team.color, total: top.total } : null;
}

const time = (d: Date | null, fallback: number) => d?.getTime() ?? fallback;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; deleted?: string }>;
}) {
  const user = await requireUser("/dashboard");
  const creator = canCreateHunts(user);
  const sp = await searchParams;
  const scope = user.isAdmin && sp.scope === "all" ? "all" : "mine";
  const items = await listDashboardHunts(user, scope);
  const now = new Date();

  const byPhase = (phases: string[]) => items.filter((i) => phases.includes(huntPhase(i.hunt, now)));
  const live = byPhase(["live"]).sort(
    (a, b) => time(a.hunt.endsAt, Number.POSITIVE_INFINITY) - time(b.hunt.endsAt, Number.POSITIVE_INFINITY),
  );
  const upcoming = byPhase(["upcoming"]).sort((a, b) => time(a.hunt.startsAt, 0) - time(b.hunt.startsAt, 0));
  const drafts = byPhase(["draft"]);
  const finished = byPhase(["ended"]).sort((a, b) => time(b.hunt.endsAt, 0) - time(a.hunt.endsAt, 0));
  const archived = byPhase(["archived"]).sort((a, b) => time(b.hunt.endsAt, 0) - time(a.hunt.endsAt, 0));

  const leaders = new Map<string, Leader>(
    await Promise.all(
      [...live, ...finished.slice(0, 12)].map(async (i) => [i.hunt.id, await leaderOf(i.hunt.id)] as const),
    ),
  );

  const deletedData = sp.deleted ? await auditData(null, "hunt.delete", sp.deleted, user.id) : null;
  const deleted = typeof deletedData?.name === "string" ? deletedData.name : null;

  return (
    <>
      <SiteHeader>
        <AccountMenu name={user.name} email={user.email} isAdmin={user.isAdmin} />
      </SiteHeader>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pt-8 pb-28 md:pb-16 outline-none"
      >
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-cond text-4xl font-extrabold tracking-tight sm:text-5xl">
              {scope === "all" ? "All hunts" : "Your hunts"}
            </h1>
            <p className="mt-1.5 max-w-prose text-ink-2">
              {items.length === 0
                ? scope === "all"
                  ? "There are no hunts on this server yet."
                  : "Hunts you organize or judge show up here."
                : summary(live.length, upcoming.length + drafts.length, finished.length + archived.length)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {user.isAdmin ? <ScopeToggle scope={scope} /> : null}
            {items.length > 0 && creator ? (
              <ButtonLink href="/dashboard/new" className="hidden md:inline-flex">
                <Plus aria-hidden />
                New hunt
              </ButtonLink>
            ) : null}
          </div>
        </header>

        {deleted ? (
          <Notice tone="success" icon={<CircleCheck className="size-4" />} title={`Deleted “${deleted}”`}>
            Its teams, submissions and photos are gone for good.
          </Notice>
        ) : null}

        {items.length === 0 ? (
          creator ? (
            <FirstHunt />
          ) : (
            <NoHuntsYet />
          )
        ) : (
          <>
            {live.length > 0 ? (
              <Section
                title={
                  <span className="flex items-center gap-3">
                    Live now <span aria-hidden className="size-2.5 rounded-full bg-danger animate-live" />
                  </span>
                }
              >
                <div className="flex flex-col gap-4">
                  {live.map((item) => (
                    <LiveHuntCard
                      key={item.hunt.id}
                      item={item}
                      leader={leaders.get(item.hunt.id) ?? null}
                      now={now.getTime()}
                    />
                  ))}
                </div>
              </Section>
            ) : null}

            {upcoming.length + drafts.length > 0 ? (
              <Section title="Drafts and upcoming">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[...upcoming, ...drafts].map((item) => (
                    <HuntCard key={item.hunt.id} item={item} />
                  ))}
                </div>
              </Section>
            ) : null}

            {finished.length > 0 ? (
              <Section title="Finished">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {finished.map((item) => (
                    <CompactHuntCard key={item.hunt.id} item={item} winner={leaders.get(item.hunt.id) ?? null} />
                  ))}
                </div>
              </Section>
            ) : null}

            {archived.length > 0 ? <Archived items={archived} /> : null}
          </>
        )}
      </main>

      {/* Primary action within thumb reach on phones (the first-run screen has its own). */}
      {items.length > 0 && creator ? (
        <div
          data-bottom-bar
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
        >
          <ButtonLink href="/dashboard/new" size="lg" className="w-full">
            <Plus aria-hidden />
            New hunt
          </ButtonLink>
        </div>
      ) : null}
    </>
  );
}

function summary(live: number, planned: number, done: number) {
  const parts: string[] = [];
  if (live) parts.push(`${live} running now`);
  if (planned) parts.push(`${planned} in the works`);
  if (done) parts.push(`${done} finished`);
  if (parts.length === 1) return `${capitalize(parts[0])}.`;
  return `${capitalize(parts.slice(0, -1).join(", "))} and ${parts[parts.length - 1]}.`;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-cond text-2xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function ScopeToggle({ scope }: { scope: "mine" | "all" }) {
  const option = (value: "mine" | "all", label: string) => (
    <Link
      href={value === "all" ? "/dashboard?scope=all" : "/dashboard"}
      aria-current={scope === value ? "page" : undefined}
      className={cn(
        "flex h-10 items-center rounded-sm px-3 text-[0.9375rem] font-semibold text-ink-2 transition-colors hover:text-ink",
        scope === value && "bg-paper text-ink shadow-sm",
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Which hunts" className="inline-flex rounded-md bg-mist p-1">
      {option("mine", "Your hunts")}
      {option("all", "All hunts")}
    </nav>
  );
}

function Archived({ items }: { items: DashboardHunt[] }) {
  return (
    <details className="group rounded-lg border border-line">
      <summary className="flex h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
        <span>
          Archived <span className="font-normal text-ink-2">({items.length})</span>
        </span>
        <span className="text-sm font-medium text-ink-2 group-open:hidden">Show</span>
        <span className="hidden text-sm font-medium text-ink-2 group-open:inline">Hide</span>
      </summary>
      <div className="grid grid-cols-1 gap-3 border-t border-line p-4 lg:grid-cols-2">
        {items.map((item) => (
          <CompactHuntCard key={item.hunt.id} item={item} winner={null} />
        ))}
      </div>
    </details>
  );
}

/** For accounts that judge or help run hunts but can't create their own. */
function NoHuntsYet() {
  return (
    <section className="flex flex-col items-center px-6 pt-6 text-center">
      <Mascot size={112} className="mb-4" />
      <h2 className="font-cond text-3xl font-extrabold tracking-tight">No hunts to work on yet</h2>
      <p className="mt-2 max-w-md text-ink-2">
        Hunts you’re invited to judge or help run appear here as soon as you accept the invite link. To create hunts of
        your own, ask a platform admin for organizer access.
      </p>
    </section>
  );
}

function FirstHunt() {
  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col items-center px-6 pt-6 text-center">
        <Mascot size={112} className="mb-4" />
        <h2 className="font-cond text-3xl font-extrabold tracking-tight">Plan your first hunt</h2>
        <p className="mt-2 max-w-md text-ink-2">
          Start from a ready-made course and make it yours, or begin with a blank map. Everything can be changed until
          the hunt starts.
        </p>
        <ButtonLink href="/dashboard/new" size="lg" className="mt-6">
          <Plus aria-hidden />
          Create a hunt
        </ButtonLink>
      </div>
      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink-2">Ready-made courses</h3>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {HUNT_TEMPLATES.map((t) => (
            <li key={t.id} data-accent={t.accent}>
              <Link
                href={`/dashboard/new?template=${t.id}`}
                className="flex items-stretch gap-4 p-3 transition-colors hover:bg-mist sm:p-4"
              >
                <HuntMap
                  seed={`template:${t.id}`}
                  controls={t.tasks.length}
                  aspect={1.3}
                  ringSize={5}
                  strength="faint"
                  className="h-20 w-24 shrink-0 rounded-md border border-line"
                />
                <span className="flex min-w-0 flex-col justify-center">
                  <span className="font-cond text-xl font-bold">{t.name}</span>
                  <span className="text-sm text-ink-2">{t.pitch}</span>
                  <span className="mt-0.5 text-sm text-ink-3">{t.bestFor}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
