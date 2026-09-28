"use client";

import Link from "next/link";
import { memo } from "react";
import { RelativeTime } from "@/components/ui/countdown";
import { StatusBadge } from "@/components/ui/status";
import { firstName, formatMeasured, statusLabel } from "@/lib/judging/labels";
import type { HistoryEntry, JudgeTask } from "@/lib/judging/types";
import { Img } from "./img";

/** The team's other submissions for this task, newest first, with the feedback they got. */
export const SubmissionHistory = memo(function SubmissionHistory({
  entries,
  teamName,
  task,
  huntId,
  serverNow,
}: {
  entries: HistoryEntry[];
  teamName: string;
  task: Pick<JudgeTask, "contestUnit" | "kind">;
  huntId: string;
  serverNow: number;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Other submissions from {teamName} for this task</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-ink-2">None. This is their first.</p>
      ) : (
        <ul className="divide-y divide-line">
          {entries.map((h) => (
            <li key={h.id}>
              <Link
                href={`/manage/${huntId}/submissions/${h.id}`}
                className="-mx-2 flex gap-3 rounded-md px-2 py-2.5 hover:bg-mist"
              >
                {h.thumb ? (
                  <Img src={h.thumb} alt="" className="size-11 shrink-0 rounded-sm bg-mist object-cover" />
                ) : null}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <StatusBadge status={h.status} label={statusLabel(h.status, h.autoJudged)} />
                    <RelativeTime at={h.createdAt} serverNow={serverNow} className="text-xs text-ink-2" />
                    {h.judgedBy ? <span className="text-xs text-ink-3">{firstName(h.judgedBy)} judged</span> : null}
                  </div>
                  {h.text ? <p className="line-clamp-2 text-sm text-ink">“{h.text}”</p> : null}
                  {task.kind === "contest" && h.contestValue != null ? (
                    <p className="text-sm text-ink-2">Measured {formatMeasured(h.contestValue, task.contestUnit)}</p>
                  ) : null}
                  {h.feedback ? <p className="line-clamp-2 text-sm text-ink-2">Feedback: {h.feedback}</p> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});
