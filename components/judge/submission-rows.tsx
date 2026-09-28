import { Film, Quote } from "lucide-react";
import Link from "next/link";
import { ControlMarker } from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/countdown";
import { StatusBadge } from "@/components/ui/status";
import { TeamAvatar } from "@/components/ui/team-badge";
import { formatPoints } from "@/lib/format";
import { firstName, formatMeasured, statusLabel } from "@/lib/judging/labels";
import type { SubmissionRow } from "@/lib/judging/submissions";
import { cn } from "@/lib/utils";
import { Img } from "./img";

function RowThumb({ row, className }: { row: SubmissionRow; className?: string }) {
  if (row.thumb) {
    return (
      <span className={cn("relative block overflow-hidden rounded-sm bg-mist", className)}>
        <Img src={row.thumb} alt="" className="size-full object-cover" />
        {row.fileCount > 1 ? (
          <span className="absolute right-0.5 bottom-0.5 rounded-full bg-ink/75 px-1.5 font-bib text-[0.65rem] leading-4 text-paper">
            {row.fileCount}
          </span>
        ) : null}
      </span>
    );
  }
  return (
    <span className={cn("grid place-items-center rounded-sm bg-mist text-ink-3", className)}>
      {row.fileCount > 0 ? <Film className="size-5" aria-hidden /> : <Quote className="size-4" aria-hidden />}
    </span>
  );
}

function Points({ row }: { row: SubmissionRow }) {
  if (row.status === "approved" && row.task.kind === "contest" && row.contestValue != null) {
    return (
      <span className="text-sm font-semibold whitespace-nowrap">
        {formatMeasured(row.contestValue, row.task.contestUnit)}
      </span>
    );
  }
  if (row.points != null) {
    return <span className="font-bib text-xl leading-none">{formatPoints(row.points)}</span>;
  }
  if (row.status === "approved") {
    return (
      <span className="text-ink-3" title="An earlier accepted submission counts for this task">
        –<span className="sr-only">Counted earlier</span>
      </span>
    );
  }
  return (
    <span className="text-ink-3">
      –<span className="sr-only">No points</span>
    </span>
  );
}

const GRID = "md:grid-cols-[3.5rem_minmax(0,1.1fr)_minmax(0,1.5fr)_8.5rem_4.5rem_6.5rem_7rem]";

const STATUS_WORDS = { pending: "In review", approved: "Accepted", rejected: "Not accepted" } as const;

/** What a screen reader hears for a row: team, task, result and points in one sentence. */
function rowLabel(row: SubmissionRow): string {
  const status = statusLabel(row.status, row.autoJudged) ?? STATUS_WORDS[row.status];
  const parts = [row.team.name, `${row.task.code} ${row.task.title}`, status];
  if (row.status === "approved" && row.task.kind === "contest" && row.contestValue != null) {
    parts.push(formatMeasured(row.contestValue, row.task.contestUnit));
  } else if (row.points != null) {
    parts.push(`${formatPoints(row.points)} points`);
  } else if (row.status === "approved") {
    parts.push("an earlier submission counts");
  }
  return parts.join(", ");
}

export function SubmissionRowsHeader() {
  return (
    <div
      aria-hidden
      className={cn("hidden border-b border-line px-3 pb-2 text-sm font-semibold text-ink-2 md:grid md:gap-x-4", GRID)}
    >
      <span />
      <span>Team</span>
      <span>Task</span>
      <span>Status</span>
      <span className="text-right">Points</span>
      <span>Sent</span>
      <span>Judged by</span>
    </div>
  );
}

export function SubmissionRows({
  rows,
  huntId,
  serverNow,
}: {
  rows: SubmissionRow[];
  huntId: string;
  serverNow: number;
}) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => {
        const href = `/manage/${huntId}/submissions/${row.id}`;
        const badge = <StatusBadge status={row.status} label={statusLabel(row.status, row.autoJudged)} />;
        const judged = row.autoJudged ? "Automatically" : row.judgedBy ? firstName(row.judgedBy) : null;
        return (
          <li key={row.id}>
            <Link
              href={href}
              className={cn(
                "flex gap-3 px-3 py-3 transition-colors hover:bg-mist md:grid md:items-center md:gap-x-4",
                GRID,
              )}
              aria-label={rowLabel(row)}
            >
              <RowThumb row={row} className="size-14 shrink-0" />

              {/* Phone: stacked */}
              <span className="flex min-w-0 flex-1 flex-col gap-1 md:hidden">
                <span className="flex min-w-0 items-center gap-2">
                  <TeamAvatar team={row.team} size="sm" className="size-6 text-xs" />
                  <span className="truncate font-semibold">{row.team.name}</span>
                </span>
                <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink-2">
                  <ControlMarker code={row.task.code} size="sm" className="size-7" label={`Control ${row.task.code}`} />
                  <span className="truncate">{row.task.title}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {badge}
                  <RelativeTime at={row.createdAt} serverNow={serverNow} className="text-xs text-ink-2" />
                </span>
              </span>
              <span className="shrink-0 self-center md:hidden">
                <Points row={row} />
              </span>

              {/* Wide: columns */}
              <span className="hidden min-w-0 items-center gap-2 md:flex">
                <TeamAvatar team={row.team} size="sm" />
                <span className="truncate font-semibold">{row.team.name}</span>
              </span>
              <span className="hidden min-w-0 items-center gap-2 md:flex">
                <ControlMarker code={row.task.code} size="sm" className="size-7" label={`Control ${row.task.code}`} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{row.task.title}</span>
                  {row.text ? <span className="truncate text-sm text-ink-2">“{row.text}”</span> : null}
                </span>
              </span>
              <span className="hidden md:block">{badge}</span>
              <span className="hidden text-right md:block">
                <Points row={row} />
              </span>
              <RelativeTime at={row.createdAt} serverNow={serverNow} className="hidden text-sm text-ink-2 md:block" />
              <span className="hidden truncate text-sm text-ink-2 md:block">{judged ?? "–"}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
