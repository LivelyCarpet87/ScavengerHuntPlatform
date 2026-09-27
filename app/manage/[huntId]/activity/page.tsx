import { ChevronRight, Download, ListChecks, Scale, Settings, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LiveRefresh } from "@/components/live/live-refresh";
import { ButtonLink } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/countdown";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/misc";
import { StatusGlyph } from "@/components/ui/status";
import { requireStaff } from "@/lib/auth/access";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { ACTIVITY_GROUPS, type ActivityGroup, type Described, describeActivity } from "@/lib/judging/activity";
import { loadActivity } from "@/lib/judging/activity-log";
import { ACTIVITY_PAGE_SIZE } from "@/lib/judging/constants";
import { firstName } from "@/lib/judging/labels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Activity" };

type Props = {
  params: Promise<{ huntId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const EMPTY_COPY: Record<ActivityGroup | "all", string> = {
  all: "Judging decisions, score adjustments and changes to teams, tasks and settings show up here, with who made them.",
  judging: "Decisions judges make in the queue or on a submission show up here.",
  scores: "Bonuses and penalties organizers add or remove show up here.",
  teams: "Changes staff make to teams and players show up here.",
  tasks: "Changes to tasks and hints show up here.",
  settings: "Changes to the hunt, its staff and announcements, and exports, show up here.",
};

function EntryIcon({ described, action }: { described: Described; action: string }) {
  const tone = described.tone;
  let icon: React.ReactNode;
  if (tone === "approved" || tone === "rejected" || tone === "pending") {
    icon = (
      <StatusGlyph
        status={tone}
        className={cn(
          "size-4",
          tone === "approved" && "text-forest",
          tone === "rejected" && "text-danger",
          tone === "pending" && "text-sun-fg",
        )}
      />
    );
  } else if (action.startsWith("export.")) {
    icon = <Download className="size-4" aria-hidden />;
  } else if (described.group === "scores" || described.group === "judging") {
    icon = <Scale className="size-4" aria-hidden />;
  } else if (described.group === "teams") {
    icon = <Users className="size-4" aria-hidden />;
  } else if (described.group === "tasks") {
    icon = <ListChecks className="size-4" aria-hidden />;
  } else {
    icon = <Settings className="size-4" aria-hidden />;
  }
  return <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-mist text-ink-2">{icon}</span>;
}

export default async function ActivityPage({ params, searchParams }: Props) {
  const { huntId } = await params;
  const sp = await searchParams;
  const { hunt, user } = await requireStaff(huntId, "organizer");

  const groupParam = typeof sp.group === "string" ? sp.group : null;
  const group = ACTIVITY_GROUPS.some((g) => g.key === groupParam) ? (groupParam as ActivityGroup) : null;
  const requestedPage = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const log = await loadActivity(hunt, { group, page: requestedPage });
  const tz = hunt.timezone;
  const now = Date.now();
  const path = `/manage/${hunt.id}/activity`;
  const href = (g: ActivityGroup | null, page = 1) => {
    const p = new URLSearchParams();
    if (g) p.set("group", g);
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    return qs ? `${path}?${qs}` : path;
  };

  // "Sam" reads better than "Sam Okafor", unless two people on the page share a first name.
  const firstNames = new Map<string, Set<string>>();
  for (const e of log.entries) {
    if (!e.actorName || !e.actorId) continue;
    const set = firstNames.get(firstName(e.actorName)) ?? new Set<string>();
    set.add(e.actorId);
    firstNames.set(firstName(e.actorName), set);
  }
  const actorLabel = (id: string | null, name: string | null) => {
    if (id && id === user.id) return "You";
    if (!name) return id ? "A former staff member" : "Someone";
    const first = firstName(name);
    return (firstNames.get(first)?.size ?? 0) > 1 ? name : first;
  };

  const today = formatDate(now, tz);
  const yesterday = formatDate(now - 86_400_000, tz);
  const days: { label: string; entries: typeof log.entries }[] = [];
  for (const entry of log.entries) {
    const day = formatDate(entry.createdAt, tz);
    const label = day === today ? "Today" : day === yesterday ? "Yesterday" : day;
    const last = days[days.length - 1];
    if (last && last.label === label) last.entries.push(entry);
    else days.push({ label, entries: [entry] });
  }

  const first = log.total === 0 ? 0 : (log.page - 1) * ACTIVITY_PAGE_SIZE + 1;
  const last = Math.min(log.total, log.page * ACTIVITY_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh huntId={hunt.id} />
      <PageHeader
        title="Activity"
        description="Everything staff changed in this hunt, newest first, so you can always answer “who changed this score?”"
        actions={
          <ButtonLink href={`/manage/${hunt.id}/scoreboard`} variant="quiet">
            Scoreboard
          </ButtonLink>
        }
      />

      <nav aria-label="Kind of activity" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <ul className="flex min-w-max gap-1 border-b border-line">
          {[{ key: null, label: "Everything" }, ...ACTIVITY_GROUPS].map((g) => {
            const active = g.key === group;
            return (
              <li key={g.key ?? "all"}>
                <Link
                  href={href(g.key)}
                  aria-current={active ? "page" : undefined}
                  scroll={false}
                  className={cn(
                    "relative flex h-11 items-center px-3 text-sm font-semibold text-ink-2 transition-colors hover:text-ink",
                    active &&
                      "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-[3px] after:rounded-full after:bg-accent",
                  )}
                >
                  {g.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {log.entries.length === 0 ? (
        <EmptyState title={group ? "Nothing here yet" : "Nothing logged yet"}>{EMPTY_COPY[group ?? "all"]}</EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {days.map((day) => (
            <section key={day.label} aria-label={day.label}>
              <h2 className="border-b border-line pb-2 font-cond text-xl font-bold">{day.label}</h2>
              <ol className="divide-y divide-line">
                {day.entries.map((entry) => {
                  const described = describeActivity(entry, log.lookup, {
                    huntId: hunt.id,
                    actor: actorLabel(entry.actorId, entry.actorName),
                  });
                  const linkable =
                    described.href &&
                    !(
                      entry.targetKind === "submission" &&
                      entry.targetId &&
                      !log.existingSubmissions.has(entry.targetId)
                    );
                  const body = (
                    <>
                      <EntryIcon described={described} action={entry.action} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-ink">
                          {described.parts.map((part, i) =>
                            part.strong ? (
                              // biome-ignore lint/suspicious/noArrayIndexKey: sentence parts are positional
                              <strong key={i} className="font-semibold">
                                {part.text}
                              </strong>
                            ) : (
                              // biome-ignore lint/suspicious/noArrayIndexKey: sentence parts are positional
                              <span key={i}>{part.text}</span>
                            ),
                          )}
                        </span>
                        {described.detail ? (
                          <span className="mt-0.5 block text-sm text-ink-2">{described.detail}</span>
                        ) : null}
                        <span className="mt-0.5 block text-xs text-ink-3" title={formatDateTime(entry.createdAt, tz)}>
                          {formatTime(entry.createdAt, tz)}, <RelativeTime at={entry.createdAt} serverNow={now} />
                        </span>
                      </span>
                      {linkable ? <ChevronRight className="mt-2 size-4 shrink-0 text-ink-3" aria-hidden /> : null}
                    </>
                  );
                  return (
                    <li key={entry.id}>
                      {linkable && described.href ? (
                        <Link href={described.href} className="-mx-3 flex gap-3 rounded-md px-3 py-3 hover:bg-mist">
                          {body}
                        </Link>
                      ) : (
                        <div className="flex gap-3 py-3">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-sm text-ink-2">
              Showing {first}–{last} of {log.total}
            </p>
            {log.pages > 1 ? (
              <div className="flex gap-2">
                {log.page > 1 ? (
                  <ButtonLink href={href(group, log.page - 1)} variant="quiet" size="sm">
                    Newer
                  </ButtonLink>
                ) : null}
                {log.page < log.pages ? (
                  <ButtonLink href={href(group, log.page + 1)} variant="quiet" size="sm">
                    Older
                  </ButtonLink>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
