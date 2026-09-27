import { cn } from "@/lib/utils";

/*
 * Submission status, shown by shape + word + color (never color alone):
 *   pending   ◌ dashed ring on yellow  "In review"
 *   approved  ● solid disc on green    "Accepted"
 *   rejected  ⊘ slashed ring on red    "Not accepted"
 */

export type SubmissionStatusValue = "pending" | "approved" | "rejected";

const copy: Record<SubmissionStatusValue, string> = {
  pending: "In review",
  approved: "Accepted",
  rejected: "Not accepted",
};

export function StatusGlyph({ status, className }: { status: SubmissionStatusValue; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("size-3.5 shrink-0", className)}>
      {status === "approved" ? <circle cx="8" cy="8" r="6.5" fill="currentColor" /> : null}
      {status === "pending" ? (
        <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3.2 2.4" />
      ) : null}
      {status === "rejected" ? (
        <>
          <circle cx="8" cy="8" r="5.75" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="4" y1="12" x2="12" y2="4" stroke="currentColor" strokeWidth="2" />
        </>
      ) : null}
    </svg>
  );
}

export function StatusBadge({
  status,
  className,
  label,
}: {
  status: SubmissionStatusValue;
  className?: string;
  /** Override the default wording, e.g. "Auto-accepted". */
  label?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 text-xs font-semibold",
        status === "pending" && "bg-sun-wash text-sun-ink dark:text-sun",
        status === "approved" && "bg-forest-wash text-forest",
        status === "rejected" && "bg-danger-wash text-danger",
        className,
      )}
    >
      <StatusGlyph status={status} />
      {label ?? copy[status]}
    </span>
  );
}
