import Link from "next/link";
import { Numeral, Ordinal } from "@/components/ui/bib";
import { ControlMarker } from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/countdown";
import { StatusBadge } from "@/components/ui/status";
import { TeamAvatar, TeamBadge } from "@/components/ui/team-badge";
import { formatPoints } from "@/lib/format";
import type { Standings } from "@/lib/scoring/service";
import { hasScored } from "@/lib/staff/format";
import type { ActivityItem } from "@/lib/staff/queries";

/** Top of the (live, staff) standings. */
export function LeaderboardMini({
  standings,
  huntId,
  limit = 5,
}: {
  standings: Standings;
  huntId: string;
  limit?: number;
}) {
  const rows = standings.standings.filter((s) => s.rank != null).slice(0, limit);
  return (
    <section aria-labelledby="leaders-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="leaders-heading" className="font-cond text-2xl font-bold">
          Leaderboard
        </h2>
        <Link href={`/manage/${huntId}/scoreboard`} className="text-sm font-semibold text-ink-2 hover:text-ink">
          Full scoreboard
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-2">
          No teams yet. They appear here as soon as they register.
        </p>
      ) : (
        <ol className="divide-y divide-line rounded-lg border border-line">
          {rows.map((s) => {
            const team = standings.teams[s.teamId];
            if (!team) return null;
            return (
              <li key={s.teamId}>
                <Link
                  href={`/manage/${huntId}/teams/${s.teamId}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-mist"
                >
                  <span className="w-9 shrink-0 text-2xl leading-none">
                    {hasScored(s) ? (
                      <Ordinal n={s.rank ?? 0} />
                    ) : (
                      <>
                        <span aria-hidden className="font-bib text-ink-3">
                          –
                        </span>
                        <span className="sr-only">No points yet</span>
                      </>
                    )}
                  </span>
                  <TeamBadge team={team} className="min-w-0 flex-1" />
                  <span className="shrink-0 text-right">
                    <Numeral className="text-2xl leading-none">{formatPoints(s.total)}</Numeral>
                    <span className="block text-xs text-ink-2">{s.solved} solved</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** The latest submissions, each linking to its detail page. */
export function ActivityFeed({ items, huntId, now }: { items: ActivityItem[]; huntId: string; now: number }) {
  return (
    <section aria-labelledby="activity-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="activity-heading" className="font-cond text-2xl font-bold">
          Latest submissions
        </h2>
        <Link href={`/manage/${huntId}/submissions`} className="text-sm font-semibold text-ink-2 hover:text-ink">
          All submissions
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-2">
          Nothing submitted yet. Photos, answers and checkpoint scans show up here the moment they arrive.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/manage/${huntId}/submissions/${item.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-mist"
              >
                <ControlMarker code={item.task.code} size="sm" state={item.status} label={`Task ${item.task.code}`} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{item.task.title}</span>
                  <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink-2">
                    <TeamAvatar team={item.team} size="sm" className="size-5 text-xs" />
                    <span className="truncate">{item.team.name}</span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge
                    status={item.status}
                    label={item.autoJudged && item.status === "approved" ? "Auto-accepted" : undefined}
                  />
                  <RelativeTime at={item.createdAt.getTime()} serverNow={now} className="text-xs text-ink-3" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
