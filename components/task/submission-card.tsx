import { MapPin } from "lucide-react";
import { Numeral } from "@/components/ui/bib";
import { StatusBadge } from "@/components/ui/status";
import type { FileRow, Submission, Task } from "@/lib/db/schema";
import { formatPoints, formatSigned, formatTime } from "@/lib/format";
import { fileUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { type MediaItem, MediaStrip } from "./media-strip";

/** Photos and videos of a submission (or task), as the client viewer expects them. */
export function toMediaItems(files: FileRow[]): MediaItem[] {
  return files
    .filter((f) => f.kind === "image" || f.kind === "video")
    .map((f) => ({
      id: f.id,
      kind: f.kind,
      thumb: f.kind === "image" ? fileUrl(f, "thumb") : f.variants.includes("poster") ? fileUrl(f, "poster") : null,
      display: fileUrl(f, "display"),
      original: fileUrl(f, "original"),
    }));
}

function statusLabel(sub: Pick<Submission, "status" | "autoJudged">, kind: Task["kind"]): string | undefined {
  if (sub.status === "approved" && sub.autoJudged) {
    return kind === "answer" ? "Correct" : kind === "checkpoint" ? "Punched" : "Auto-accepted";
  }
  if (sub.status === "rejected" && sub.autoJudged && kind === "answer") return "Not quite";
  return undefined;
}

/**
 * One of the team's submissions: status, time, media, what they wrote, the
 * judge's note and what it earned.
 */
export function SubmissionCard({
  sub,
  files,
  task,
  timeZone,
  points,
  hideFeedback = false,
  className,
}: {
  sub: Submission;
  files: FileRow[];
  task: Pick<Task, "kind" | "contestUnit">;
  timeZone: string;
  /** Points this submission earned the team (the solve, or a judge's award), if any. */
  points?: number | null;
  /** The judge's note is already shown prominently elsewhere. */
  hideFeedback?: boolean;
  className?: string;
}) {
  const media = toMediaItems(files);
  const judgeNote = !sub.autoJudged && sub.feedback && !hideFeedback ? sub.feedback : null;
  return (
    <article className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusBadge status={sub.status} label={statusLabel(sub, task.kind)} />
        <time dateTime={sub.createdAt.toISOString()} className="text-sm text-ink-2">
          Sent {formatTime(sub.createdAt, timeZone)}
        </time>
        {points != null && sub.status === "approved" ? (
          <span className="ml-auto text-sm text-ink-2">
            <Numeral className="text-xl text-ink">{formatSigned(points)}</Numeral> points
          </span>
        ) : null}
      </div>

      {media.length > 0 ? <MediaStrip items={media} label="Your proof" size="sm" /> : null}

      {sub.text ? (
        task.kind === "checkpoint" ? (
          <p className="text-sm text-ink-2">
            Code <span className="font-bib text-lg tracking-wider text-ink">{sub.text}</span>
          </p>
        ) : task.kind === "answer" ? (
          <p className="text-lg font-medium break-words">“{sub.text}”</p>
        ) : (
          <p className="whitespace-pre-line break-words">{sub.text}</p>
        )
      ) : null}

      {task.kind === "contest" && sub.status === "approved" && sub.contestValue != null ? (
        <p className="text-sm text-ink-2">
          Judges recorded <Numeral className="text-lg text-ink">{formatPoints(sub.contestValue)}</Numeral>
          {task.contestUnit ? ` ${task.contestUnit}` : ""}.
        </p>
      ) : null}

      {judgeNote ? (
        <blockquote className="border-l-4 border-line-strong pl-3 text-ink">
          <span className="text-sm font-semibold text-ink-2">Judge: </span>
          {judgeNote}
        </blockquote>
      ) : null}

      {sub.lat != null && sub.lng != null ? (
        <p className="flex items-center gap-1.5 text-xs text-ink-3">
          <MapPin aria-hidden className="size-3.5" />
          Location attached{sub.accuracy != null ? `, accurate to about ${Math.round(sub.accuracy)} m` : ""}
        </p>
      ) : null}
    </article>
  );
}
