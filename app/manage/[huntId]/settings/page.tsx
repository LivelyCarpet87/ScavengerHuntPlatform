import { count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConfirmAction } from "@/components/staff/confirm-action";
import { DuplicateHuntButton } from "@/components/staff/duplicate-hunt-button";
import { BasicsForm } from "@/components/staff/settings/basics-form";
import { CoverForm } from "@/components/staff/settings/cover-form";
import { DangerZone } from "@/components/staff/settings/danger-zone";
import { FeedbackForm } from "@/components/staff/settings/feedback-form";
import { RegistrationForm } from "@/components/staff/settings/registration-form";
import { ScheduleForm } from "@/components/staff/settings/schedule-form";
import { type ActiveInvite, type StaffMember, StaffSection } from "@/components/staff/settings/staff-section";
import { StatusSection } from "@/components/staff/settings/status-section";
import { VisibilityForm } from "@/components/staff/settings/visibility-form";
import { PageHeader } from "@/components/ui/misc";
import { requireStaff } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { adjustments, hintUnlocks } from "@/lib/db/schema";
import { publishConsequence } from "@/lib/staff/format";
import { regenerateJoinCodeAction } from "@/lib/staff/hunt-actions";
import { getFile, getHuntStats, listActiveInvites, listStaff } from "@/lib/staff/queries";
import { fileUrl } from "@/lib/storage";
import { absoluteUrl, baseUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  { id: "basics", label: "Basics" },
  { id: "schedule", label: "Schedule" },
  { id: "registration", label: "Registration" },
  { id: "visibility", label: "Scoreboard" },
  { id: "judging", label: "Judging" },
  { id: "staff", label: "Staff" },
  { id: "status", label: "Status" },
  { id: "danger", label: "Danger zone" },
] as const;

function Section({
  id,
  title,
  description,
  children,
  tone,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  tone?: "danger";
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="grid scroll-mt-20 grid-cols-1 gap-5 border-t border-line py-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10"
    >
      <div>
        <h2 id={`${id}-heading`} className={cn("font-cond text-2xl font-bold", tone === "danger" && "text-danger")}>
          {title}
        </h2>
        {description ? <p className="mt-1.5 text-sm text-ink-2">{description}</p> : null}
      </div>
      <div className="min-w-0 max-w-2xl">{children}</div>
    </section>
  );
}

export default async function SettingsPage({ params }: { params: Promise<{ huntId: string }> }) {
  const { huntId } = await params;
  const { hunt, role, user } = await requireStaff(huntId, "organizer");
  const owner = role === "owner";
  const now = new Date();

  const [origin, cover, staff, invites, stats, reveals, adjustmentCount] = await Promise.all([
    baseUrl().then((b) => new URL(b).host),
    getFile(hunt.id, hunt.coverFileId),
    listStaff(hunt.id),
    listActiveInvites(hunt.id, now),
    getHuntStats(hunt.id),
    db.select({ n: count() }).from(hintUnlocks).where(eq(hintUnlocks.huntId, hunt.id)).get(),
    db.select({ n: count() }).from(adjustments).where(eq(adjustments.huntId, hunt.id)).get(),
  ]);
  const inviteData: ActiveInvite[] = await Promise.all(
    invites.map(async (i) => ({
      id: i.id,
      url: await absoluteUrl(`/invite/${i.id}`),
      role: i.role,
      createdAt: i.createdAt.getTime(),
      expiresAt: i.expiresAt?.getTime() ?? null,
      maxUses: i.maxUses,
      uses: i.uses,
      byName: i.byName,
    })),
  );
  const members: StaffMember[] = staff.map((m) => ({
    userId: m.userId,
    name: m.name,
    email: m.email,
    role: m.role,
    addedAt: m.createdAt.getTime(),
  }));
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  const spacedCode = `${hunt.joinCode.slice(0, 3)} ${hunt.joinCode.slice(3)}`;

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Settings"
        description="Each section saves on its own. Players see changes straight away."
        className="mb-4"
      />
      <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none]">
        <ul className="flex min-w-max gap-1.5">
          {SECTIONS.filter((s) => s.id !== "danger" || owner).map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="flex h-9 items-center rounded-full bg-mist px-3.5 text-sm font-semibold text-ink-2 hover:bg-mist-2 hover:text-ink"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section
        id="basics"
        title="Basics"
        description="What players see first: the name, the link, the introduction and the color."
      >
        <div className="flex flex-col gap-10">
          <BasicsForm
            huntId={hunt.id}
            origin={origin}
            values={{
              name: hunt.name,
              slug: hunt.slug,
              tagline: hunt.tagline,
              description: hunt.description,
              accent: hunt.accent,
            }}
          />
          <div className="border-t border-line pt-8">
            <CoverForm huntId={hunt.id} coverUrl={cover ? fileUrl(cover, "display") : null} />
          </div>
        </div>
      </Section>

      <Section
        id="schedule"
        title="Schedule"
        description="Enter times as they are where you are: your browser converts them. The hunt prints its times in its own time zone."
      >
        <ScheduleForm
          huntId={hunt.id}
          values={{
            startsAt: iso(hunt.startsAt),
            endsAt: iso(hunt.endsAt),
            freezeAt: iso(hunt.freezeAt),
            timezone: hunt.timezone,
          }}
        />
      </Section>

      <Section id="registration" title="Registration" description="How players find the hunt and get into a team.">
        <div className="flex flex-col gap-10">
          <RegistrationForm
            huntId={hunt.id}
            values={{
              joinMode: hunt.joinMode,
              teamCreation: hunt.teamCreation,
              registrationOpen: hunt.registrationOpen,
              maxTeamSize: hunt.maxTeamSize,
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8">
            <div>
              <p className="text-sm font-semibold">Hunt code</p>
              <p className="font-bib text-4xl tracking-wide">{spacedCode}</p>
            </div>
            <ConfirmAction
              action={regenerateJoinCodeAction}
              fields={{ huntId: hunt.id }}
              label="Generate a new hunt code"
              variant="secondary"
              title="Generate a new hunt code?"
              description={`${spacedCode} and its QR stop working, so printed join posters need reprinting. Teams that already registered aren’t affected.`}
              confirmLabel="Generate new code"
              confirmVariant="primary"
            />
          </div>
        </div>
      </Section>

      <Section
        id="visibility"
        title="Scoreboard and gallery"
        description="Who sees the standings, and when everyone can browse each other’s photos."
      >
        <VisibilityForm
          huntId={hunt.id}
          values={{ scoreboardVisibility: hunt.scoreboardVisibility, galleryMode: hunt.galleryMode }}
        />
      </Section>

      <Section id="judging" title="Judging" description="Messages judges can send with one tap in the judging queue.">
        <FeedbackForm huntId={hunt.id} templates={hunt.feedbackTemplates} />
      </Section>

      <Section
        id="staff"
        title="Staff"
        description="Judges review submissions. Organizers also edit tasks, teams and settings. Owners can do everything."
      >
        <StaffSection
          huntId={hunt.id}
          me={user.id}
          myRole={role}
          isAdmin={user.isAdmin}
          members={members}
          invites={inviteData}
          serverNow={now.getTime()}
        />
      </Section>

      <Section
        id="status"
        title="Status"
        description="Drafts are private. Published hunts follow their schedule. Archived hunts are read-only."
      >
        <div className="flex flex-col gap-8">
          <StatusSection
            huntId={hunt.id}
            huntName={hunt.name}
            status={hunt.status}
            publishConsequence={publishConsequence(hunt, now)}
            playerCount={stats.players}
          />
          <div className="flex flex-col gap-3 border-t border-line pt-8">
            <div>
              <p className="font-semibold">Run it again</p>
              <p className="text-sm text-ink-2">
                Copies the settings, tasks, hints and attachments into a new draft. Teams, submissions and the schedule
                aren’t copied.
              </p>
            </div>
            <div>
              <DuplicateHuntButton
                huntId={hunt.id}
                huntName={hunt.name}
                variant="secondary"
                size="md"
                label="Duplicate hunt"
              />
            </div>
          </div>
        </div>
      </Section>

      {owner ? (
        <Section
          id="danger"
          title="Danger zone"
          tone="danger"
          description="Owners only. Both actions ask you to type the hunt’s name."
        >
          <DangerZone
            huntId={hunt.id}
            huntName={hunt.name}
            counts={{
              submissions: stats.pending + stats.approved + stats.rejected,
              hintReveals: reveals?.n ?? 0,
              adjustments: adjustmentCount?.n ?? 0,
              teams: stats.teams + stats.hiddenTeams,
              tasks: stats.tasks,
            }}
          />
        </Section>
      ) : (
        <p className="border-t border-line py-8 text-sm text-ink-2">
          Resetting or deleting the hunt is up to its owners.
        </p>
      )}
    </div>
  );
}
