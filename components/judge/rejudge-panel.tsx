"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { StatusGlyph } from "@/components/ui/status";
import { toast } from "@/components/ui/toast";
import type { SubmissionStatus } from "@/lib/db/schema";
import { formatPoints, formatSigned } from "@/lib/format";
import { judgeSubmission, revertJudgement } from "@/lib/judging/actions";
import type { Draft, JudgeResult, JudgeTask, JudgeTeam } from "@/lib/judging/types";
import { parseMeasured, parsePoints, projectApproval, type TaskScoringContext } from "@/lib/judging/what-if";
import { appendFeedback, FeedbackField, type FieldError, PointsField } from "./decision-fields";

type Pending = "approve" | "reject" | "revert" | null;

/**
 * Decision controls on a submission's own page: approve, reject, change the
 * points or measured value, rewrite feedback, or put it back in review.
 * Every change is checked against the version on screen, so two people
 * editing the same submission can't silently overwrite each other.
 */
export function RejudgePanel({
  huntId,
  submission,
  task,
  team,
  teams,
  scoring,
  templates,
  settingsHref,
  archived,
}: {
  huntId: string;
  submission: {
    id: string;
    status: SubmissionStatus;
    judgedAt: number | null;
    createdAt: number;
    feedback: string | null;
    pointsOverride: number | null;
    contestValue: number | null;
  };
  task: JudgeTask;
  team: JudgeTeam;
  teams: Record<string, JudgeTeam>;
  scoring: TaskScoringContext | null;
  templates: string[];
  settingsHref: string | null;
  archived: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({
    feedback: submission.feedback ?? "",
    override: submission.pointsOverride != null ? String(submission.pointsOverride) : null,
    value: submission.contestValue != null ? String(submission.contestValue) : "",
  });
  const [error, setError] = useState<FieldError | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [, startTransition] = useTransition();

  const value = parseMeasured(draft.value);
  const override = draft.override == null ? null : parsePoints(draft.override);
  const projection = useMemo(
    () =>
      scoring
        ? projectApproval(
            scoring,
            { id: submission.id, teamId: team.id, submittedAt: submission.createdAt },
            {
              contestValue: value != null && Number.isFinite(value) ? value : null,
              pointsOverride: override != null && Number.isFinite(override) ? override : null,
            },
          )
        : null,
    [scoring, submission.id, submission.createdAt, team.id, value, override],
  );

  const onDraft = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null);
  };

  const finish = (result: JudgeResult, success: string) => {
    setPending(null);
    if (result.ok) {
      toast({
        title: success,
        description:
          result.status === "pending"
            ? "It’s waiting in the judging queue again."
            : result.status === "approved"
              ? `${team.name} now holds ${formatPoints(result.points)} points for this task.`
              : draft.feedback.trim()
                ? `${team.name} sees your feedback with the result.`
                : `${team.name} sees it as not accepted.`,
        tone: result.status === "approved" ? "success" : "neutral",
      });
      return;
    }
    if (result.field) setError({ field: result.field, message: result.error });
    toast({ title: "Not saved", description: result.error, tone: "danger" });
    if (result.stale) startTransition(() => router.refresh());
  };

  const decide = async (decision: "approve" | "reject") => {
    if (archived) return;
    const isContest = task.kind === "contest";
    if (decision === "approve" && isContest && task.needsValue && (value == null || Number.isNaN(value))) {
      setError({
        field: "contestValue",
        message:
          value == null
            ? `Enter the measured value${task.contestUnit ? ` in ${task.contestUnit}` : ""} to approve.`
            : "Type the value as a number, like 184 or 18.5.",
      });
      return;
    }
    if (decision === "approve" && !isContest && override != null && Number.isNaN(override)) {
      setError({ field: "pointsOverride", message: "Points must be a whole number, like 80." });
      return;
    }
    setPending(decision);
    let result: JudgeResult;
    try {
      result = await judgeSubmission({
        huntId,
        submissionId: submission.id,
        decision,
        pointsOverride: decision === "approve" && !isContest ? override : null,
        contestValue: decision === "approve" && isContest && value != null && !Number.isNaN(value) ? value : null,
        feedback: draft.feedback.trim() || null,
        // Optimistic concurrency: only if nobody changed it since this page loaded.
        // (A decided row without a timestamp can't be versioned; save it as is.)
        expectedJudgedAt: submission.status === "pending" ? null : (submission.judgedAt ?? undefined),
        from: "detail",
      });
    } catch {
      result = { ok: false, error: "Couldn’t reach the server. Check your connection and try again." };
    }
    const was = submission.status;
    finish(
      result,
      decision === "approve"
        ? was === "approved"
          ? "Changes saved"
          : was === "rejected"
            ? "Changed to accepted"
            : "Accepted"
        : was === "rejected"
          ? "Feedback saved"
          : was === "approved"
            ? "Changed to not accepted"
            : "Not accepted",
    );
  };

  const revert = async () => {
    if (archived) return;
    setPending("revert");
    let result: JudgeResult;
    try {
      result = await revertJudgement({
        huntId,
        submissionId: submission.id,
        expectedJudgedAt: submission.judgedAt ?? undefined,
        from: "detail",
      });
    } catch {
      result = { ok: false, error: "Couldn’t reach the server. Check your connection and try again." };
    }
    finish(result, "Back in review");
  };

  // The score change this save would make; nothing when it's 0.
  const delta =
    projection && (task.kind !== "contest" || projection.place != null || !task.needsValue)
      ? projection.points - projection.current || null
      : null;
  const status = submission.status;

  return (
    <div className="flex flex-col gap-5">
      {archived ? (
        <Notice tone="warning" title="This hunt is archived">
          Results are read-only.
        </Notice>
      ) : null}

      {projection ? (
        <PointsField
          task={task}
          team={team}
          teams={teams}
          projection={projection}
          draft={draft}
          onDraft={onDraft}
          error={error}
        />
      ) : null}

      <FeedbackField
        templates={templates}
        value={draft.feedback}
        onChange={(v) => onDraft({ feedback: v })}
        onInsert={(t) => onDraft({ feedback: appendFeedback(draft.feedback, t) })}
        settingsHref={settingsHref}
        error={error?.field === "feedback" ? error.message : null}
      />

      <div className="flex flex-col gap-2">
        {status === "pending" ? (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2">
            <Button
              variant="secondary"
              size="lg"
              className="px-3"
              onClick={() => void decide("reject")}
              pending={pending === "reject"}
              disabled={archived || pending != null}
            >
              {pending === "reject" ? null : <StatusGlyph status="rejected" className="size-4 text-danger" />}
              Reject
            </Button>
            <Button
              size="lg"
              className="px-3"
              onClick={() => void decide("approve")}
              pending={pending === "approve"}
              disabled={archived || pending != null}
            >
              Approve
              {delta != null ? <span className="font-bib text-lg">{formatSigned(delta)}</span> : null}
            </Button>
          </div>
        ) : status === "approved" ? (
          <>
            <Button
              size="lg"
              onClick={() => void decide("approve")}
              pending={pending === "approve"}
              disabled={archived || pending != null}
            >
              Save changes
              {delta ? <span className="font-bib text-lg">{formatSigned(delta)}</span> : null}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void decide("reject")}
              pending={pending === "reject"}
              disabled={archived || pending != null}
            >
              {pending === "reject" ? null : <StatusGlyph status="rejected" className="size-4 text-danger" />}
              Change to not accepted
            </Button>
          </>
        ) : (
          <>
            <Button
              size="lg"
              onClick={() => void decide("approve")}
              pending={pending === "approve"}
              disabled={archived || pending != null}
            >
              Approve instead
              {delta != null ? <span className="font-bib text-lg">{formatSigned(delta)}</span> : null}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void decide("reject")}
              pending={pending === "reject"}
              disabled={archived || pending != null}
            >
              Save feedback
            </Button>
          </>
        )}
        {status !== "pending" ? (
          <Button
            variant="ghost"
            onClick={() => void revert()}
            pending={pending === "revert"}
            disabled={archived || pending != null}
          >
            {pending === "revert" ? null : <RotateCcw aria-hidden />}
            Put back in review
          </Button>
        ) : null}
      </div>
    </div>
  );
}
