import type { Metadata } from "next";
import { GalleryControls } from "@/components/gallery/gallery-controls";
import { GalleryPager } from "@/components/gallery/gallery-pager";
import { GalleryView } from "@/components/gallery/gallery-view";
import { RefreshAt } from "@/components/home/refresh-at";
import { LiveRefresh } from "@/components/live/live-refresh";
import { ButtonLink } from "@/components/ui/button";
import { FinishMark } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { getPlayerHunt } from "@/lib/auth/access";
import type { Hunt } from "@/lib/db/schema";
import { formatDate, formatDateTime, formatTime, plural } from "@/lib/format";
import { canViewGallery, getHuntBySlug, huntPhase } from "@/lib/hunts";
import { loadGallery } from "@/lib/live/gallery";
import { galleryPage, groupGallery, parsePage } from "@/lib/live/gallery-groups";
import { describeMedia } from "@/lib/live/types";
import { links } from "@/lib/url";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const hunt = await getHuntBySlug(slug);
  if (!hunt || hunt.status === "draft") return {};
  return { title: `${hunt.name} photos` };
}

export default async function GalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { hunt, me, staffRole } = await getPlayerHunt(slug);
  const viewer = { isStaff: !!staffRole, isPlayer: !!me, teamId: me?.team.id ?? null };
  const now = new Date();
  const open = canViewGallery(hunt, viewer, now);
  const by = query.by === "team" ? "team" : "task";
  const mine = !!me && query.mine === "1";
  const requestedPage = parsePage(query.page);
  const basePath = `/h/${hunt.slug}/gallery`;
  // The gallery opens by itself at the finish (a timer, plus hunt.changed for schedule edits); only
  // viewers allowed on the event stream listen to it.
  const live = (
    <>
      <RefreshAt at={[hunt.freezeAt?.getTime(), hunt.endsAt?.getTime()]} />
      {viewer.isStaff || viewer.isPlayer || hunt.scoreboardVisibility === "public" ? (
        <LiveRefresh huntId={hunt.id} on={["hunt.changed"]} />
      ) : null}
    </>
  );

  if (!open) {
    // Players still see their own team's accepted photos while everyone else's are closed.
    const own = me ? await loadGallery(hunt, viewer, { onlyTeamId: me.team.id, now }) : [];
    const shown = galleryPage(groupGallery(own, "task"), requestedPage);
    return (
      <div className="flex flex-col gap-8">
        {live}
        <ClosedGallery hunt={hunt} isVisitor={!me && !staffRole} />
        {own.length > 0 ? (
          <section className="flex flex-col gap-5 border-t border-line pt-6">
            <div>
              <h2 className="font-cond text-2xl font-bold">Your team’s photos so far</h2>
              <p className="text-ink-2">
                {hunt.galleryMode === "off"
                  ? "Only your team and the judges see these."
                  : "Only your team can see these until the hunt ends."}
              </p>
            </div>
            <GalleryView groups={shown.groups} timezone={hunt.timezone} />
            <GalleryPager basePath={basePath} page={shown.page} pages={shown.pages} />
          </section>
        ) : null}
      </div>
    );
  }

  const items = await loadGallery(hunt, viewer, { onlyTeamId: mine ? me?.team.id : null, now });
  const phase = huntPhase(hunt, now);
  const teams = new Set(items.map((i) => i.team.id)).size;
  // A big hunt comes a page at a time: phones never load every photo of the event at once.
  const shown = galleryPage(groupGallery(items, by), requestedPage);

  return (
    <div className="flex flex-col gap-6">
      {live}
      <header>
        <h1 className="flex items-center gap-3 font-cond text-4xl font-extrabold tracking-tight">
          {phase === "ended" || phase === "archived" ? <FinishMark size={30} /> : null}
          Photos
        </h1>
        <p className="mt-1.5 text-ink-2">
          {items.length === 0
            ? "Every accepted photo and video from the hunt."
            : `${describeMedia(items, "accepted")} from ${mine ? "your team" : plural(teams, "team")}.`}
          {shown.pages > 1 ? ` Page ${shown.page} of ${shown.pages}.` : null}
        </p>
      </header>

      <GalleryControls basePath={basePath} by={by} mine={mine} canFilterMine={!!me} />

      {items.length === 0 ? (
        <EmptyState
          title={mine ? "Your team has no accepted photos yet" : "No photos yet"}
          action={
            me && (phase === "live" || phase === "upcoming") ? (
              <ButtonLink href={links.hunt(hunt.slug)} variant="secondary">
                Open the task list
              </ButtonLink>
            ) : undefined
          }
        >
          {mine
            ? "When a judge accepts one of your team’s photos or videos, it shows up here."
            : "Accepted photos and videos show up here as judges approve them."}
        </EmptyState>
      ) : (
        <>
          <GalleryView groups={shown.groups} timezone={hunt.timezone} />
          <GalleryPager basePath={basePath} by={by} mine={mine} page={shown.page} pages={shown.pages} />
        </>
      )}
    </div>
  );
}

function ClosedGallery({
  hunt,
  isVisitor,
}: {
  hunt: Pick<Hunt, "slug" | "galleryMode" | "endsAt" | "timezone" | "scoreboardVisibility">;
  isVisitor: boolean;
}) {
  if (hunt.galleryMode === "off") {
    return (
      <EmptyState title="This hunt doesn’t share photos">
        The organizers keep each team’s photos private. Judges still see everything you send.
      </EmptyState>
    );
  }
  if (isVisitor && hunt.scoreboardVisibility !== "public") {
    return (
      <EmptyState
        title="Photos are for teams in this hunt"
        action={<ButtonLink href={links.hunt(hunt.slug)}>Join this hunt</ButtonLink>}
      >
        Join a team to see everyone’s photos when they open.
      </EmptyState>
    );
  }
  const endsAt = hunt.endsAt;
  const sameDay = endsAt && formatDate(endsAt, hunt.timezone) === formatDate(new Date(), hunt.timezone);
  return (
    <EmptyState title="Photos open when the hunt ends">
      {endsAt
        ? `Every accepted photo and video appears here at ${sameDay ? formatTime(endsAt, hunt.timezone) : formatDateTime(endsAt, hunt.timezone)}.`
        : "Every accepted photo and video appears here once the organizers end the hunt."}
    </EmptyState>
  );
}
