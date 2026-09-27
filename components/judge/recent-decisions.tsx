"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ControlMarker } from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/countdown";
import { StatusGlyph } from "@/components/ui/status";
import { TeamAvatar } from "@/components/ui/team-badge";
import { formatSigned } from "@/lib/format";
import { firstName, possessive } from "@/lib/judging/labels";
import type { JudgeTask, JudgeTeam, RecentDecision } from "@/lib/judging/types";
import { cn } from "@/lib/utils";

/**
 * The last few decisions, each with a way back into the queue. Three short
 * lines per decision (team and points, task, verdict and when) so it reads
 * the same in the narrow decision column and on the "All caught up" page.
 */
export function RecentDecisions({
  decisions,
  tasks,
  teams,
  huntId,
  serverNow,
  onReopen,
  reopening,
  disabled,
}: {
  decisions: RecentDecision[];
  tasks: Record<string, JudgeTask>;
  teams: Record<string, JudgeTeam>;
  huntId: string;
  serverNow: number;
  onReopen: (id: string) => void;
  reopening: string | null;
  disabled?: boolean;
}) {
  if (decisions.length === 0) return null;
  return (
    <section className="w-full text-left">
      <h2 className="font-cond text-xl font-bold">Recent decisions</h2>
      <p className="mt-0.5 text-sm text-ink-2">Changed your mind? Reopen one to put it back in the queue.</p>
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {decisions.map((d) => {
          const task = tasks[d.taskId];
          const team = teams[d.teamId];
          if (!task || !team) return null;
          const approved = d.status === "approved";
          const who = d.byMe ? "you" : firstName(d.judgedBy);
          return (
            <li key={d.id} className="flex gap-3 py-3">
              <TeamAvatar team={team} size="sm" className="mt-0.5" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <Link
                    href={`/manage/${huntId}/submissions/${d.id}`}
                    aria-label={`${possessive(team.name)} submission for ${task.code} ${task.title}`}
                    className="min-w-0 flex-1 truncate font-semibold hover:underline hover:decoration-2 hover:underline-offset-2"
                  >
                    {team.name}
                  </Link>
                  <RelativeTime
                    at={d.judgedAt}
                    serverNow={serverNow}
                    className="shrink-0 text-xs whitespace-nowrap text-ink-3"
                  />
                </div>
                <p className="flex min-w-0 items-center gap-1.5 text-sm text-ink-2">
                  <ControlMarker
                    code={task.code}
                    size="sm"
                    state={approved ? "approved" : "rejected"}
                    className="size-6"
                    label={`Control ${task.code}`}
                  />
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  {approved ? (
                    <span className="shrink-0 font-bib text-lg leading-none text-ink">{formatSigned(d.points)}</span>
                  ) : null}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-1.5 text-xs text-ink-2">
                    <StatusGlyph
                      status={d.status}
                      className={cn("size-3.5", approved ? "text-forest" : "text-danger")}
                    />
                    <span className="truncate">
                      {approved ? "Accepted" : "Not accepted"} by {who}
                    </span>
                  </p>
                  <Button
                    variant="quiet"
                    size="sm"
                    className="shrink-0 max-lg:h-11"
                    onClick={() => onReopen(d.id)}
                    pending={reopening === d.id}
                    disabled={disabled || (reopening != null && reopening !== d.id)}
                    aria-label={`Reopen ${possessive(team.name)} submission for ${task.code} ${task.title}`}
                  >
                    {reopening === d.id ? null : <RotateCcw aria-hidden />}
                    Reopen
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
