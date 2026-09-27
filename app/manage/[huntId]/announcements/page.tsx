import { Pin, PinOff, Trash } from "lucide-react";
import type { Metadata } from "next";
import { LiveRefresh } from "@/components/live/live-refresh";
import { ActionButton } from "@/components/staff/action-button";
import { ComposeAnnouncement } from "@/components/staff/announcements/compose-form";
import { ConfirmAction } from "@/components/staff/confirm-action";
import { RelativeTime } from "@/components/ui/countdown";
import { Markdown } from "@/components/ui/markdown";
import { PageHeader } from "@/components/ui/misc";
import { requireStaff } from "@/lib/auth/access";
import { plural } from "@/lib/format";
import { huntPhase } from "@/lib/hunts";
import { deleteAnnouncementAction, setAnnouncementPinnedAction } from "@/lib/staff/announcement-actions";
import { getHuntStats, listAnnouncements, pushReach } from "@/lib/staff/queries";
import { plainText } from "@/lib/staff/text";

export const metadata: Metadata = { title: "Announcements" };

/** How screen readers tell the announcements' buttons apart: the title, or the start of the message. */
function announcementName(a: { title: string | null; body: string }) {
  return a.title || plainText(a.body, 48);
}

export default async function AnnouncementsPage({ params }: { params: Promise<{ huntId: string }> }) {
  const { huntId } = await params;
  const { hunt } = await requireStaff(huntId, "organizer");
  const [items, reach, stats] = await Promise.all([
    listAnnouncements(hunt.id),
    pushReach(hunt.id),
    getHuntStats(hunt.id),
  ]);
  const now = Date.now();
  const phase = huntPhase(hunt);

  const reachNote =
    stats.players === 0
      ? phase === "draft"
        ? "Nobody has joined yet: the hunt is still a draft. Announcements you send now are waiting in Updates when players arrive."
        : "Nobody has joined yet. Announcements you send now are waiting in Updates when players arrive."
      : `Every player sees it in Updates, with a pop-up if the app is open. ${
          reach > 0
            ? `${plural(reach, "phone")} with notifications on also ${reach === 1 ? "gets" : "get"} a push notification.`
            : "No player has turned on notifications yet."
        }`;

  return (
    <div className="flex flex-col gap-8">
      <LiveRefresh huntId={hunt.id} on={["announcement.created", "hunt.changed"]} />
      <PageHeader
        title="Announcements"
        description="Tell every team something at once: a new task, a change of plan, where the finish is."
      />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <section aria-labelledby="compose-heading" className="flex flex-col gap-4 self-start lg:sticky lg:top-6">
          <h2 id="compose-heading" className="font-cond text-2xl font-bold">
            New announcement
          </h2>
          <ComposeAnnouncement huntId={hunt.id} reachNote={reachNote} />
        </section>

        <section aria-labelledby="sent-heading" className="flex flex-col gap-4">
          <h2 id="sent-heading" className="font-cond text-2xl font-bold">
            Sent
            {items.length ? (
              <span className="ml-2 font-sans text-base font-normal text-ink-2">{items.length}</span>
            ) : null}
          </h2>
          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-2">
              Nothing sent yet. Your announcements appear here, newest first, with pinned ones on top.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {items.map((a) => (
                <li key={a.id} className="flex flex-col gap-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      {a.pinned ? (
                        <p className="mb-1 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
                          <Pin aria-hidden className="size-3.5" /> Pinned
                        </p>
                      ) : null}
                      {a.title ? <h3 className="font-semibold text-lg leading-snug">{a.title}</h3> : null}
                    </div>
                    <p className="shrink-0 text-sm text-ink-2">
                      {a.byName ? `${a.byName}, ` : ""}
                      <RelativeTime at={a.createdAt.getTime()} serverNow={now} />
                    </p>
                  </div>
                  <Markdown className="text-[0.9375rem]">{a.body}</Markdown>
                  <div className="flex flex-wrap gap-1">
                    <ActionButton
                      action={setAnnouncementPinnedAction}
                      fields={{ huntId: hunt.id, announcementId: a.id, pinned: a.pinned ? "false" : "on" }}
                      variant="ghost"
                      size="sm"
                    >
                      {a.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
                      {a.pinned ? "Unpin" : "Pin to the top"}
                      <span className="sr-only"> “{announcementName(a)}”</span>
                    </ActionButton>
                    <ConfirmAction
                      action={deleteAnnouncementAction}
                      fields={{ huntId: hunt.id, announcementId: a.id }}
                      label={
                        <>
                          Delete<span className="sr-only"> “{announcementName(a)}”</span>
                        </>
                      }
                      icon={<Trash aria-hidden />}
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      title="Delete this announcement?"
                      description="It disappears from players’ Updates. Notifications already delivered stay on their phones."
                      confirmLabel="Delete announcement"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
