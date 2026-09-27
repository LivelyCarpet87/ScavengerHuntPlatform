"use client";

import Link from "next/link";
import { memo, type Ref, useId } from "react";
import { Ordinal } from "@/components/ui/bib";
import { Input, Textarea } from "@/components/ui/field";
import { formatPoints, ordinal } from "@/lib/format";
import { formatMeasured, possessive } from "@/lib/judging/labels";
import type { Draft, JudgeTask, JudgeTeam } from "@/lib/judging/types";
import type { ApprovalProjection } from "@/lib/judging/what-if";
import { cn } from "@/lib/utils";
import { KeyHint } from "./key-hint";

export type FieldError = { field: "contestValue" | "pointsOverride" | "feedback" | null; message: string };

/** Points preview, "award different points", and the measured value for contests. */
function PointsFieldImpl({
  task,
  team,
  teams,
  projection,
  draft,
  onDraft,
  error,
  valueRef,
  overrideRef,
  showKeys,
}: {
  task: JudgeTask;
  team: JudgeTeam;
  teams: Record<string, JudgeTeam>;
  projection: ApprovalProjection;
  draft: Draft;
  onDraft: (patch: Partial<Draft>) => void;
  error: FieldError | null;
  valueRef?: Ref<HTMLInputElement>;
  overrideRef?: Ref<HTMLInputElement>;
  showKeys?: boolean;
}) {
  const id = useId();
  if (task.kind === "contest") {
    return (
      <ContestField
        id={id}
        task={task}
        team={team}
        teams={teams}
        projection={projection}
        draft={draft}
        onDraft={onDraft}
        error={error?.field === "contestValue" ? error.message : null}
        valueRef={valueRef}
        showKeys={showKeys}
      />
    );
  }

  const overriding = draft.override != null;
  const overrideError = error?.field === "pointsOverride" ? error.message : null;

  // An earlier accepted submission is the team's solve: this one can't change their score,
  // so there's nothing to award (the engine reads the override on the solve only).
  if (projection.alreadySolved) {
    return (
      <div className="flex flex-col gap-2">
        <p className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-ink-2">Adds</span>
          <span className="font-bib text-5xl leading-none">0</span>
          <span className="text-sm font-semibold text-ink-2">points</span>
        </p>
        <p className="text-sm text-ink-2">
          {possessive(team.name)} earlier accepted submission already counts for this task, so approving this one only
          records it. They keep {formatPoints(projection.points)}.
        </p>
      </div>
    );
  }

  let note: string | null = null;
  if (projection.hidden) {
    note = "Hidden team: it scores, but isn’t ranked and doesn’t change anyone else’s points.";
  } else if (projection.position != null) {
    note = `${ordinal(projection.position)} team to solve it, by submission time.`;
  } else if (projection.rarity && projection.rarity.solversBefore > 0) {
    const { before, after, solversBefore } = projection.rarity;
    note =
      before === after
        ? `The ${solversBefore === 1 ? "team" : `${solversBefore} teams`} who solved it keep ${formatPoints(after)}.`
        : `Approving drops ${solversBefore === 1 ? "the team" : `all ${solversBefore} teams`} who solved it from ${formatPoints(before)} to ${formatPoints(after)}.`;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-ink-2">Worth</span>
        <span className="font-bib text-5xl leading-none">{formatPoints(projection.points)}</span>
        <span className="text-sm font-semibold text-ink-2">{overriding ? "as entered" : "now"}</span>
      </p>
      {note ? <p className="text-sm text-ink-2">{note}</p> : null}

      {overriding ? (
        <div className="mt-1 flex flex-col gap-1.5">
          <label htmlFor={`${id}-override`} className="flex items-center gap-2 text-sm font-semibold">
            Points to award
            {showKeys ? <KeyHint k="P" className="hidden lg:inline-flex" /> : null}
          </label>
          <p id={`${id}-override-hint`} className="-mt-1 text-sm text-ink-2">
            Replaces the computed value for this team. Use it for partial credit or a bonus.
          </p>
          <div className="flex gap-2">
            <Input
              id={`${id}-override`}
              ref={overrideRef}
              inputMode="numeric"
              autoComplete="off"
              value={draft.override ?? ""}
              onChange={(e) => onDraft({ override: e.target.value })}
              aria-invalid={overrideError ? true : undefined}
              aria-describedby={`${id}-override-hint${overrideError ? ` ${id}-override-error` : ""}`}
              className="w-32 font-bib text-xl"
            />
            <button
              type="button"
              onClick={() => onDraft({ override: null })}
              className="h-12 rounded-md px-3 text-sm font-semibold text-ink-2 hover:bg-mist hover:text-ink"
            >
              Use computed points
            </button>
          </div>
          {overrideError ? (
            <p id={`${id}-override-error`} className="text-sm font-medium text-danger">
              {overrideError}
            </p>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onDraft({ override: String(projection.points) })}
          className="flex h-9 items-center gap-2 self-start rounded-md text-sm font-semibold text-ink underline decoration-line-strong decoration-2 underline-offset-4 hover:decoration-ink"
        >
          Award different points
          {showKeys ? <KeyHint k="P" className="hidden lg:inline-flex" /> : null}
        </button>
      )}
    </div>
  );
}

function ContestField({
  id,
  task,
  team,
  teams,
  projection,
  draft,
  onDraft,
  error,
  valueRef,
  showKeys,
}: {
  id: string;
  task: JudgeTask;
  team: JudgeTeam;
  teams: Record<string, JudgeTeam>;
  projection: ApprovalProjection;
  draft: Draft;
  onDraft: (patch: Partial<Draft>) => void;
  error: string | null;
  valueRef?: Ref<HTMLInputElement>;
  showKeys?: boolean;
}) {
  const ranking = projection.ranking ?? [];
  const place = projection.place;
  const unit = task.contestUnit;

  let summary: string;
  if (projection.hidden) summary = "Hidden team: its entries never take contest places.";
  else if (place == null) summary = "Enter the value to see where they place.";
  else if (place <= task.contestPlaces)
    summary = `That places ${team.name} ${ordinal(place)}, worth ${formatPoints(projection.points)}.`;
  else summary = `That places ${team.name} ${ordinal(place)}, outside the ${task.contestPlaces} scoring places.`;

  // Show the scoring places plus this team's row if it lands lower.
  const shown = ranking.filter((e) => e.place <= task.contestPlaces || e.teamId === team.id);

  return (
    <div className="flex flex-col gap-3">
      {task.needsValue ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-value`} className="flex items-center gap-2 text-sm font-semibold">
            Measured value{unit ? ` in ${unit}` : ""}
            {showKeys ? <KeyHint k="P" className="hidden lg:inline-flex" /> : null}
          </label>
          <p id={`${id}-value-hint`} className="-mt-1 text-sm text-ink-2">
            {task.contestRank === "lowest"
              ? "Lowest value wins."
              : task.contestRank === "total"
                ? "Added to the team’s other accepted entries."
                : "Highest value wins. A team’s best entry counts."}
          </p>
          <div className="relative w-44">
            <Input
              id={`${id}-value`}
              ref={valueRef}
              inputMode="decimal"
              autoComplete="off"
              value={draft.value}
              onChange={(e) => onDraft({ value: e.target.value })}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${id}-value-hint${error ? ` ${id}-value-error` : ""}`}
              className={cn("font-bib text-xl", unit && "pr-16")}
            />
            {unit ? (
              <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm font-semibold text-ink-2">
                {unit}
              </span>
            ) : null}
          </div>
          {error ? (
            <p id={`${id}-value-error`} role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="text-sm text-ink-2" aria-live="polite">
        {summary}
      </p>

      {shown.length > 0 ? (
        <ol className="divide-y divide-line rounded-lg border border-line text-sm">
          {shown.map((entry) => {
            const t = teams[entry.teamId];
            const mine = entry.teamId === team.id;
            return (
              <li
                key={entry.teamId}
                className={cn("flex items-center gap-3 px-3 py-2", mine && "bg-accent-wash font-semibold")}
              >
                <Ordinal n={entry.place} className="w-9 shrink-0 text-lg" />
                <span className="min-w-0 flex-1 truncate">
                  {t?.name ?? "Unknown team"}
                  {mine ? <span className="sr-only"> (with this entry)</span> : null}
                </span>
                {entry.value != null ? (
                  <span className="shrink-0 text-ink-2">{formatMeasured(entry.value, unit)}</span>
                ) : null}
                <span className="w-12 shrink-0 text-right font-bib text-base">
                  {entry.points > 0 ? formatPoints(entry.points) : "–"}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

/** Canned replies as one-tap chips (1–9 on the keyboard) plus free text. */
function FeedbackFieldImpl({
  templates,
  value,
  onChange,
  onInsert,
  textareaRef,
  error,
  showKeys,
  settingsHref,
  autoFocus,
}: {
  templates: string[];
  value: string;
  onChange: (value: string) => void;
  onInsert: (template: string) => void;
  textareaRef?: Ref<HTMLTextAreaElement>;
  error?: string | null;
  showKeys?: boolean;
  /** Where organizers add saved replies (omitted for judges). */
  settingsHref?: string | null;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`${id}-feedback`} className="flex items-center gap-2 text-sm font-semibold">
        Feedback for the team
        {showKeys ? <KeyHint k="F" className="hidden lg:inline-flex" /> : null}
        <span className="ml-auto text-xs font-medium text-ink-3">Optional</span>
      </label>
      {templates.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Saved replies">
          {templates.map((t, i) => (
            <li key={`${i}-${t}`} className="max-w-full">
              <button
                type="button"
                onClick={() => onInsert(t)}
                className="flex min-h-9 max-w-full items-center gap-2 rounded-full bg-mist py-1 pr-3 pl-1.5 text-left text-sm font-medium text-ink hover:bg-mist-2"
              >
                {i < 9 && showKeys ? (
                  <KeyHint k={String(i + 1)} className="hidden lg:inline-flex" kbdClassName="rounded-full" />
                ) : null}
                <span className="line-clamp-2">{t}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : settingsHref ? (
        <p className="text-sm text-ink-2">
          Tip: add saved replies in{" "}
          <Link href={settingsHref} className="font-semibold text-ink underline decoration-2 underline-offset-2">
            hunt settings
          </Link>{" "}
          to answer in one tap.
        </p>
      ) : null}
      <Textarea
        id={`${id}-feedback`}
        ref={textareaRef}
        rows={3}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        maxLength={1000}
        aria-invalid={error ? true : undefined}
        placeholder="Shown to the team with the result"
        className="min-h-20"
      />
      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}

/** Joins a saved reply onto what's already typed. */
export function appendFeedback(current: string, template: string): string {
  const base = current.trimEnd();
  if (!base) return template;
  if (base.includes(template)) return current;
  return `${base} ${template}`;
}

export const PointsField = memo(PointsFieldImpl);

export const FeedbackField = memo(FeedbackFieldImpl);
