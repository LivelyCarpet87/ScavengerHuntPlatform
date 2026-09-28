"use client";

import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatBytes } from "@/lib/format";
import type { SubmitPhase } from "./use-submitter";

/**
 * Upload progress with percentage and a cancel button, for the task page's
 * action bar. The form moves focus here when its Submit button gives way to
 * it: to Cancel while there's something to cancel, else to the bar itself.
 */
export function UploadProgress({
  phase,
  what,
  onCancel,
  ref,
  cancelRef,
}: {
  phase: SubmitPhase;
  /** "your photo", "2 photos", "your entry" */
  what: string;
  onCancel: () => void;
  ref?: Ref<HTMLDivElement>;
  cancelRef?: Ref<HTMLButtonElement>;
}) {
  if (phase.kind === "idle") return null;
  const uploading = phase.kind === "uploading";
  const percent = uploading && phase.total > 0 ? Math.min(100, Math.round((phase.loaded / phase.total) * 100)) : null;
  const label =
    phase.kind === "preparing"
      ? `Getting ${what} ready`
      : phase.kind === "processing"
        ? "Almost done"
        : `Uploading ${what}`;
  return (
    <div ref={ref} tabIndex={-1} className="flex items-center gap-3 outline-none">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="flex min-w-0 items-center gap-2 truncate font-semibold">
            {percent == null ? <Spinner className="size-4 shrink-0 text-accent" /> : null}
            <span className="truncate">{label}</span>
          </span>
          {percent != null ? <span className="font-bib text-lg leading-none">{percent}%</span> : null}
        </div>
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? undefined}
          aria-valuetext={
            uploading && phase.total > 0 ? `${formatBytes(phase.loaded)} of ${formatBytes(phase.total)}` : label
          }
          className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-mist-2"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-200"
            style={{ width: `${percent ?? (phase.kind === "processing" ? 100 : 8)}%` }}
          />
        </div>
      </div>
      {phase.kind === "uploading" || phase.kind === "preparing" ? (
        <Button ref={cancelRef} variant="secondary" onClick={onCancel} className="shrink-0">
          Cancel
        </Button>
      ) : null}
    </div>
  );
}
