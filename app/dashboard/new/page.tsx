import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/shells/site-header";
import { AccountMenu } from "@/components/staff/account-menu";
import { HuntMap } from "@/components/staff/hunt-map";
import { NewHuntForm } from "@/components/staff/new-hunt-form";
import { ContourArt } from "@/components/ui/contour-art";
import { CANNOT_CREATE_HUNTS, canCreateHunts, requireUser } from "@/lib/auth/access";
import type { Accent } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { templateSummaries } from "@/lib/templates";
import { baseUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "New hunt" };

const KIND_WORDS = { media: "photo", answer: "answer", checkpoint: "checkpoint", contest: "contest" } as const;

export default async function NewHuntPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const user = await requireUser("/dashboard/new");
  if (!canCreateHunts(user)) {
    return (
      <>
        <SiteHeader>
          <AccountMenu name={user.name} email={user.email} isAdmin={user.isAdmin} />
        </SiteHeader>
        <main id="main" tabIndex={-1} className="mx-auto max-w-xl px-4 pt-6 pb-16 outline-none">
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center gap-2 text-sm font-semibold text-ink-2 hover:text-ink"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Your hunts
          </Link>
          <h1 className="mt-4 font-cond text-4xl font-extrabold tracking-tight">
            Creating hunts needs organizer access
          </h1>
          <p className="mt-3 text-ink-2">{CANNOT_CREATE_HUNTS}</p>
        </main>
      </>
    );
  }
  const sp = await searchParams;
  const huntId = newId();
  const origin = new URL(await baseUrl()).host;
  const templates = templateSummaries();
  const initialTemplate = templates.some((t) => t.id === sp.template) ? (sp.template as string) : "blank";

  // Each template shows its own suggested color, whatever color is picked for the new hunt below.
  // (Overprint has no data-accent rule of its own, so it resets the token explicitly.)
  const thumb = (seed: string, controls: number, accent: Accent = "overprint") => (
    <span data-accent={accent} className={cn("block", accent === "overprint" && "[--accent:var(--overprint)]")}>
      <HuntMap
        seed={seed}
        controls={controls}
        aspect={1.35}
        ringSize={4}
        strength="faint"
        className="h-14 w-[4.75rem] rounded-sm border border-line"
      />
    </span>
  );

  const options = [
    {
      value: "blank",
      label: "Blank map",
      description: "No tasks yet. Build your own course from scratch.",
      icon: thumb("template:blank", 0),
    },
    ...templates.map((t) => ({
      value: t.id,
      label: t.name,
      description: (
        <>
          {t.pitch}
          <span className="mt-1 block text-ink-3">
            {t.taskCount} tasks:{" "}
            {(Object.keys(t.kinds) as (keyof typeof t.kinds)[])
              .filter((k) => t.kinds[k] > 0)
              .map((k) => `${t.kinds[k]} ${KIND_WORDS[k]}${t.kinds[k] === 1 ? "" : "s"}`)
              .join(", ")}
            . {t.bestFor}
          </span>
        </>
      ),
      icon: thumb(`template:${t.id}`, t.taskCount, t.accent),
    })),
  ];

  return (
    <>
      <SiteHeader>
        <AccountMenu name={user.name} email={user.email} isAdmin={user.isAdmin} />
      </SiteHeader>
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 pt-6 pb-10 md:pb-16 outline-none">
        <Link
          href="/dashboard"
          className="inline-flex h-11 items-center gap-2 text-sm font-semibold text-ink-2 hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Your hunts
        </Link>
        <header className="mt-2 mb-8">
          <h1 className="font-cond text-4xl font-extrabold tracking-tight sm:text-5xl">New hunt</h1>
          <p className="mt-1.5 max-w-prose text-ink-2">
            Name it, pick a starting point, and you’ll land on its setup checklist.
          </p>
        </header>
        <NewHuntForm
          huntId={huntId}
          terrain={<ContourArt seed={huntId} />}
          origin={origin}
          options={options}
          taskCounts={Object.fromEntries(templates.map((t) => [t.id, t.taskCount]))}
          templateAccents={Object.fromEntries(templates.map((t) => [t.id, t.accent])) as Record<string, Accent>}
          initialTemplate={initialTemplate}
        />
      </main>
    </>
  );
}
