import type { Metadata } from "next";
import { LiveRefresh } from "@/components/live/live-refresh";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/misc";
import { type FeedItem, UpdatesFeed } from "@/components/updates/updates-feed";
import { UpdatesSeen } from "@/components/updates/updates-seen";
import { requirePlayer } from "@/lib/auth/access";
import { getHuntBySlug, isTaskVisible, scoreboardCutoff, submissionBlockReason } from "@/lib/hunts";
import { getTeamProgress } from "@/lib/player/progress";
import { getUpdatesFeed } from "@/lib/player/queries";
import { getStandings } from "@/lib/scoring/service";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const hunt = await getHuntBySlug(slug);
  return hunt && hunt.status !== "draft" ? { title: { absolute: `Updates – ${hunt.name}` } } : {};
}

/** Announcements from the organizers and the judges' decisions on the team's proof, newest first. */
export default async function UpdatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { hunt, me, staffRole } = await requirePlayer(slug);
  const nowDate = new Date();
  const now = nowDate.getTime();
  const cutoff = scoreboardCutoff(hunt, { isStaff: !!staffRole, isPlayer: true }, nowDate);

  const [feed, standings, progress] = await Promise.all([
    getUpdatesFeed(hunt.id, me.team.id),
    getStandings(hunt.id, { cutoff }),
    getTeamProgress(me.team.id),
  ]);

  const announcements: FeedItem[] = feed.announcements.map((a) => ({
    kind: "announcement",
    id: a.id,
    at: a.createdAt.getTime(),
    pinned: a.pinned,
    title: a.title,
    body: a.body,
  }));
  const results: FeedItem[] = feed.results.map((r) => {
    const p = progress.get(r.taskId);
    // A standard task scores once: only the team's first accepted proof carries the points.
    const firstAccepted = p?.approvedAt?.getTime();
    const counts = r.status === "approved" && firstAccepted === r.createdAt.getTime();
    const award = standings.awards[me.team.id]?.[r.taskId];
    const outOfTries =
      r.task.kind === "answer" && r.task.maxAttempts != null && (p?.wrongAttempts ?? 0) >= r.task.maxAttempts;
    return {
      kind: "result",
      id: r.id,
      at: r.judgedAt.getTime(),
      status: r.status === "approved" ? "approved" : "rejected",
      task: {
        id: r.task.id,
        code: r.task.code,
        title: r.task.title,
        contestUnit: r.task.contestUnit,
        isContest: r.task.kind === "contest",
      },
      feedback: r.feedback,
      points: r.task.kind !== "contest" && counts && award != null ? award : null,
      contestValue: r.contestValue,
      // Only offer another try when the team can actually send one now.
      canRetry: p?.state === "rejected" && !outOfTries && submissionBlockReason(hunt, r.task, nowDate) == null,
      linkable: isTaskVisible(r.task, nowDate),
    };
  });

  const pinned = announcements.filter((a) => a.kind === "announcement" && a.pinned);
  const rest = [...announcements.filter((a) => a.kind === "announcement" && !a.pinned), ...results].sort(
    (a, b) => b.at - a.at,
  );
  const items = [...pinned, ...rest];
  const newest = items.reduce((max, i) => Math.max(max, i.at), 0);
  const since = (me.player.seenUpdatesAt ?? me.player.createdAt).getTime();

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh huntId={hunt.id} on={["announcement.created", "submission.judged"]} />
      <PageHeader
        title="Updates"
        description="Announcements from the organizers, and what the judges decided on your team’s proof."
      />
      {items.length === 0 ? (
        <EmptyState
          title="No updates yet"
          action={
            <ButtonLink href={`/h/${hunt.slug}`} variant="secondary">
              Back to the tasks
            </ButtonLink>
          }
        >
          When the organizers post an announcement or a judge reviews your team’s proof, it shows up here.
        </EmptyState>
      ) : (
        <UpdatesSeen huntId={hunt.id} since={since} newest={newest}>
          <UpdatesFeed items={items} slug={hunt.slug} now={now} />
        </UpdatesSeen>
      )}
    </div>
  );
}
