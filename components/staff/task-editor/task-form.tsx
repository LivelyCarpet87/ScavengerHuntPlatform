"use client";

import { Camera, KeyRound, MapPin, Printer, RefreshCw, Trophy } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChoiceCards, Segmented } from "@/components/ui/choice";
import { ControlMarker } from "@/components/ui/control";
import { DateTimeField } from "@/components/ui/datetime-field";
import { Field, Input, Switch, Textarea } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { StatusGlyph } from "@/components/ui/status";
import type { ContestRank, ScoringMode, TaskKind } from "@/lib/db/schema";
import { formatPoints, ordinal } from "@/lib/format";
import { newCode, normalizeCode } from "@/lib/ids";
import { type AnswerMatchMode, matchAnswer, regexAnswerError } from "@/lib/judging/answers";
import { curveLabel, curvePoints, describeCurve, describeLadder, ladderValues } from "@/lib/staff/format";
import { saveTaskAction } from "@/lib/staff/task-actions";
import { parseLines } from "@/lib/staff/text";
import { MarkdownField } from "../markdown-field";
import { useActionForm } from "../use-action-form";
import { ScoringPreview } from "./scoring-preview";

export type TaskFormValues = {
  id: string | null;
  code: number;
  title: string;
  description: string;
  kind: TaskKind;
  category: string | null;
  mediaAccept: "photo" | "video" | "any";
  autoApprove: boolean;
  answers: string[];
  answerMatch: AnswerMatchMode;
  maxAttempts: number | null;
  checkpointCode: string;
  scoring: ScoringMode;
  points: number;
  minPoints: number;
  decaySolves: number;
  contestRank: ContestRank;
  contestPlaces: number;
  contestUnit: string | null;
  unlockAt: string | null;
  lockAt: string | null;
  hidden: boolean;
};

const int = (s: string, fallback: number) => {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
};

function Section({
  id,
  title,
  description,
  children,
  hidden,
}: {
  id?: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  hidden?: boolean;
}) {
  return (
    <section
      id={id}
      hidden={hidden}
      className="flex flex-col gap-5 border-t border-line pt-8 first-of-type:border-0 first-of-type:pt-0"
    >
      <div>
        <h2 className="font-cond text-2xl font-bold">{title}</h2>
        {description ? <p className="mt-1 max-w-prose text-sm text-ink-2">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * The task editor: type, basics, type-specific settings, scoring with a live
 * preview, and timing. Every type's fields stay mounted (just hidden), so
 * switching types back and forth never loses what was typed. `readOnly`
 * (archived hunts) shows the same fields, switched off, without Save.
 */
export function TaskForm({
  huntId,
  values,
  categories,
  submissionCount,
  printHref,
  cancelHref,
  readOnly = false,
}: {
  huntId: string;
  values: TaskFormValues;
  categories: string[];
  submissionCount: number;
  printHref: string | null;
  cancelHref: string;
  readOnly?: boolean;
}) {
  const { state, pending, onSubmit, formRef } = useActionForm(saveTaskAction);
  const ids = useId();
  const [kind, setKind] = useState<TaskKind>(values.kind);
  const [code, setCode] = useState(String(values.code));
  const [scoring, setScoring] = useState<ScoringMode>(values.scoring);
  const [points, setPoints] = useState(String(values.points));
  const [minPoints, setMinPoints] = useState(String(values.minPoints));
  const [decaySolves, setDecaySolves] = useState(String(values.decaySolves));
  const [places, setPlaces] = useState(String(values.contestPlaces));
  const [rank, setRank] = useState<ContestRank>(values.contestRank);
  const [answersText, setAnswersText] = useState(values.answers.join("\n"));
  const [match, setMatch] = useState<AnswerMatchMode>(values.answerMatch);
  const [checkpointCode, setCheckpointCode] = useState(values.checkpointCode);
  const [trial, setTrial] = useState("");

  const err = (name: string) => fieldError(state, name);
  const isNew = values.id == null;
  const P = Math.max(0, int(points, 0));
  const M = Math.min(Math.max(0, int(minPoints, 0)), P);
  const D = Math.max(2, int(decaySolves, 10));
  const N = Math.min(Math.max(1, int(places, 3)), 20);
  // Past 20 solves the preview samples the curve (labels keep the real solve counts).
  const curve = curvePoints({ scoring, points: P, minPoints: M, decaySolves: D });
  const answers = parseLines(answersText);
  const patternProblems =
    match === "regex"
      ? answers
          .map((pattern, i) => ({ line: i + 1, problem: regexAnswerError(pattern) }))
          .filter((p): p is { line: number; problem: string } => p.problem != null)
      : [];
  const codeNumber = int(code, values.code);

  return (
    <form
      ref={formRef}
      onSubmit={readOnly ? (e) => e.preventDefault() : onSubmit}
      className="flex min-w-0 flex-col gap-8"
      noValidate
    >
      <input type="hidden" name="huntId" value={huntId} />
      <input type="hidden" name="taskId" value={values.id ?? ""} />

      {/* A disabled fieldset switches off every control inside it; `contents` keeps the form's layout. */}
      <fieldset disabled={readOnly} className="contents [&_input:disabled]:opacity-50">
        {!isNew && !readOnly && submissionCount > 0 ? (
          <Notice
            tone="info"
            title={`${submissionCount} ${submissionCount === 1 ? "submission" : "submissions"} so far`}
          >
            Scoring changes apply to them too: every team’s points are recalculated the moment you save.
          </Notice>
        ) : null}

        <Section title="Type" description="What teams send to complete it.">
          <ChoiceCards
            name="kind"
            label="Type"
            defaultValue={values.kind}
            columns={2}
            onChange={(v) => setKind(v as TaskKind)}
            options={[
              {
                value: "media",
                label: "Photo or video",
                description: "Teams upload proof; a judge reviews it.",
                icon: <Camera className="size-5" />,
              },
              {
                value: "answer",
                label: "Answer",
                description: "Teams type an answer; it’s checked instantly.",
                icon: <KeyRound className="size-5" />,
              },
              {
                value: "checkpoint",
                label: "Checkpoint",
                description: "Teams scan a QR code you put up on site.",
                icon: <MapPin className="size-5" />,
              },
              {
                value: "contest",
                label: "Contest",
                description: "Teams compete; the best entries win places.",
                icon: <Trophy className="size-5" />,
              },
            ]}
          />
          {!isNew && submissionCount > 0 && kind !== values.kind ? (
            <Notice tone="warning" title="This task already has submissions">
              They were sent for the old type and stay as they are. Check them in Submissions after saving.
            </Notice>
          ) : null}
        </Section>

        <Section title="Basics">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-[13rem_minmax(0,1fr)]">
            <Field label="Code" error={err("code")}>
              {(p) => (
                <div className="flex items-center gap-3">
                  <Input
                    {...p}
                    name="code"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                    className="w-24 font-bib text-xl"
                  />
                  <ControlMarker
                    code={codeNumber || "?"}
                    size="md"
                    label={`Preview of control ${code || "without a code"}`}
                  />
                </div>
              )}
            </Field>
            <Field label="Title" error={err("title")}>
              {(p) => (
                <Input
                  {...p}
                  name="title"
                  defaultValue={values.title}
                  maxLength={80}
                  placeholder="The red door"
                  required
                />
              )}
            </Field>
          </div>
          <p className="-mt-2 text-sm text-ink-2">
            The code is printed on the control marker, like on an orienteering map. It’s a name, not an order: teams
            choose their own route.
          </p>
          <MarkdownField
            name="description"
            label="Description"
            hint="What to do and what counts as proof. Players read this on their phones, so keep it short."
            defaultValue={values.description}
            maxLength={5000}
            rows={5}
            error={err("description")}
          />
          <Field
            label="Category"
            hint="Optional. A short label like “Riddles” that groups related tasks."
            error={err("category")}
          >
            {(p) => (
              <>
                <Input
                  {...p}
                  name="category"
                  defaultValue={values.category ?? ""}
                  list={`${ids}-categories`}
                  maxLength={40}
                  autoComplete="off"
                />
                <datalist id={`${ids}-categories`}>
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
        </Section>

        <Section title="Answer" hidden={kind !== "answer"}>
          <Field
            label="Accepted answers"
            hint="One per line. Leave empty and a judge will check every answer by hand."
            error={err("answers")}
          >
            {(p) => (
              <Textarea
                {...p}
                name="answers"
                rows={4}
                value={answersText}
                onChange={(e) => setAnswersText(e.target.value)}
                placeholder={"gargoyle\ngargoyles"}
                spellCheck={false}
              />
            )}
          </Field>
          {answers.length === 0 ? (
            <p className="-mt-2 flex items-center gap-2 text-sm text-ink-2">
              <StatusGlyph status="pending" className="text-sun-fg" />
              No answers yet, so a judge will review each one.
            </p>
          ) : null}
          {patternProblems.length > 0 ? (
            <ul className="-mt-2 flex flex-col gap-1 text-sm font-medium text-danger">
              {patternProblems.map((p) => (
                <li key={p.line}>
                  Line {p.line}: {p.problem}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Matching</p>
            <ChoiceCards
              name="answerMatch"
              label="Matching"
              defaultValue={values.answerMatch}
              columns={3}
              onChange={(v) => setMatch(v as AnswerMatchMode)}
              options={[
                {
                  value: "loose",
                  label: "Forgiving",
                  description:
                    "Ignores capitals, accents, extra spaces, punctuation around it and a leading “the”: “The Gargoyle!” matches “gargoyle”.",
                },
                {
                  value: "exact",
                  label: "Exact",
                  description: "Must match letter for letter, capitals included. Spaces at either end don’t count.",
                },
                {
                  value: "regex",
                  label: "Pattern",
                  description:
                    "Each line is a regular expression for the whole answer, ignoring capitals: colou?r matches “Colour”.",
                },
              ]}
            />
          </div>
          {answers.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-lg bg-mist p-4">
              <label htmlFor={`${ids}-trial`} className="text-sm font-semibold">
                Try an answer
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  id={`${ids}-trial`}
                  value={trial}
                  onChange={(e) => setTrial(e.target.value)}
                  placeholder="Type what a team might send"
                  className="min-w-0 flex-1 basis-52 bg-paper"
                  autoComplete="off"
                />
                {trial.trim() ? (
                  matchAnswer(trial, answers, match) ? (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-forest" aria-live="polite">
                      <StatusGlyph status="approved" /> Would be accepted
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-danger" aria-live="polite">
                      <StatusGlyph status="rejected" /> Wouldn’t be accepted
                    </span>
                  )
                ) : null}
              </div>
            </div>
          ) : null}
          <Field
            label="Wrong answers allowed"
            hint="After this many wrong answers the task locks for that team. Leave empty for unlimited."
            error={err("maxAttempts")}
            className="max-w-xs"
          >
            {(p) => (
              <Input
                {...p}
                name="maxAttempts"
                inputMode="numeric"
                defaultValue={values.maxAttempts ?? ""}
                placeholder="Unlimited"
              />
            )}
          </Field>
        </Section>

        <Section title="Checkpoint" hidden={kind !== "checkpoint"}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-cp`} className="text-sm font-semibold">
              Checkpoint code
            </label>
            <p id={`${ids}-cp-hint`} className="-mt-1 text-sm text-ink-2">
              Printed on the poster and inside its QR code. Teams who can’t scan can type it instead.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={`${ids}-cp`}
                name="checkpointCode"
                value={checkpointCode}
                onChange={(e) => setCheckpointCode(normalizeCode(e.target.value).slice(0, 16))}
                aria-describedby={`${ids}-cp-hint`}
                aria-invalid={err("checkpointCode") ? true : undefined}
                autoComplete="off"
                spellCheck={false}
                className="max-w-52 font-bib text-2xl tracking-[0.12em]"
              />
              <Button variant="quiet" onClick={() => setCheckpointCode(newCode(6))}>
                <RefreshCw aria-hidden />
                Generate new code
              </Button>
            </div>
            {err("checkpointCode") ? <p className="text-sm font-medium text-danger">{err("checkpointCode")}</p> : null}
          </div>
          {printHref ? (
            <Link
              href={printHref}
              className="inline-flex items-center gap-2 self-start text-sm font-semibold text-ink underline decoration-2 underline-offset-2"
            >
              <Printer aria-hidden className="size-4" />
              Print this checkpoint’s poster
            </Link>
          ) : (
            <p className="text-sm text-ink-2">You can print the poster once the task is saved.</p>
          )}
          {!isNew && checkpointCode !== values.checkpointCode ? (
            <Notice tone="warning" title="Reprint the poster after saving">
              The old code, and any poster printed with it, stops working when you save.
            </Notice>
          ) : null}
        </Section>

        <Section title="Contest" hidden={kind !== "contest"}>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Rank entries by</p>
            <ChoiceCards
              name="contestRank"
              label="Rank entries by"
              defaultValue={values.contestRank}
              onChange={(v) => setRank(v as ContestRank)}
              options={[
                { value: "highest", label: "Highest value", description: "Tallest tower, most people in one photo." },
                { value: "lowest", label: "Lowest value", description: "Fastest time, fewest steps." },
                { value: "total", label: "Biggest total", description: "Adds up all of a team’s accepted entries." },
                {
                  value: "earliest",
                  label: "First to finish",
                  description: "The earliest accepted entries win. Judges don’t record a value.",
                },
              ]}
            />
          </div>
          <Field
            label="Unit"
            hint="Shown next to the values judges record, e.g. cm, people or seconds."
            error={err("contestUnit")}
            className={rank === "earliest" ? "hidden" : "max-w-xs"}
          >
            {(p) => (
              <Input
                {...p}
                name="contestUnit"
                defaultValue={values.contestUnit ?? ""}
                maxLength={16}
                placeholder="cm"
              />
            )}
          </Field>
        </Section>

        <Section
          title={kind === "contest" ? "Entries" : "Photo or video"}
          hidden={kind !== "media" && kind !== "contest"}
        >
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Teams can send</p>
            <Segmented
              name="mediaAccept"
              label="Teams can send"
              defaultValue={values.mediaAccept}
              className="self-start"
              options={[
                { value: "photo", label: "Photo" },
                { value: "video", label: "Video" },
                { value: "any", label: "Either" },
              ]}
            />
          </div>
          <div hidden={kind !== "media"}>
            <Switch
              name="autoApprove"
              defaultChecked={values.autoApprove}
              label="Accept without review"
              hint="Submissions count straight away and judges can still reject them later. Good for quick, low-stakes tasks."
            />
          </div>
        </Section>

        <Section
          title="Scoring"
          description={
            kind === "contest"
              ? "The best entries earn points on a steep ladder, from 1st place down to the last place that scores (up to 20 places)."
              : "Solve order uses the time a team submitted, not when a judge got to it."
          }
        >
          <div hidden={kind === "contest"}>
            <ChoiceCards
              name="scoring"
              label="Scoring"
              defaultValue={values.scoring}
              columns={3}
              onChange={(v) => setScoring(v as ScoringMode)}
              options={[
                { value: "fixed", label: "Fixed", description: "Every team that solves it earns the same points." },
                {
                  value: "rarity",
                  label: "Rarity",
                  description:
                    "Worth more while few teams have it. The value drops for everyone as more teams solve it.",
                },
                {
                  value: "race",
                  label: "Race",
                  description: "The first team earns the most; each team after earns a little less.",
                },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Field
              label={kind === "contest" ? "Points for 1st" : scoring === "fixed" ? "Points" : "Starting points"}
              error={err("points")}
            >
              {(p) => (
                <Input
                  {...p}
                  name="points"
                  inputMode="numeric"
                  value={points}
                  onChange={(e) => setPoints(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
                  className="font-bib text-xl"
                />
              )}
            </Field>
            <Field
              label={kind === "contest" ? "Points for last place" : "Minimum points"}
              error={err("minPoints")}
              className={kind !== "contest" && scoring === "fixed" ? "hidden" : undefined}
            >
              {(p) => (
                <Input
                  {...p}
                  name="minPoints"
                  inputMode="numeric"
                  value={minPoints}
                  onChange={(e) => setMinPoints(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
                  className="font-bib text-xl"
                />
              )}
            </Field>
            {kind === "contest" ? (
              <Field label="Places that score" error={err("contestPlaces")}>
                {(p) => (
                  <Input
                    {...p}
                    name="contestPlaces"
                    inputMode="numeric"
                    value={places}
                    onChange={(e) => setPlaces(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                    className="font-bib text-xl"
                  />
                )}
              </Field>
            ) : (
              <Field
                label="Solves to reach the minimum"
                error={err("decaySolves")}
                className={scoring === "fixed" ? "hidden" : undefined}
              >
                {(p) => (
                  <Input
                    {...p}
                    name="decaySolves"
                    inputMode="numeric"
                    value={decaySolves}
                    onChange={(e) => setDecaySolves(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                    className="font-bib text-xl"
                  />
                )}
              </Field>
            )}
          </div>
          {kind === "contest" ? <input type="hidden" name="decaySolves" value={decaySolves} /> : null}
          {kind !== "contest" ? <input type="hidden" name="contestPlaces" value={places} /> : null}

          {kind === "contest" ? (
            <ScoringPreview
              title="Points by place"
              values={ladderValues({ points: P, minPoints: M, contestPlaces: N })}
              labels={Array.from({ length: N }, (_, i) => ordinal(i + 1))}
              summary={`${describeLadder({ points: P, minPoints: M, contestPlaces: N })}. Other entries earn nothing.`}
              columnLabel="Place"
            />
          ) : scoring === "fixed" ? (
            <p className="rounded-lg bg-mist px-4 py-3 text-sm">
              Every team that solves it earns <span className="font-bib text-base">{formatPoints(P)}</span> points.
            </p>
          ) : (
            <ScoringPreview
              title={scoring === "race" ? "Points by solve order" : "Points each solver holds, by number of solvers"}
              values={curve.map((c) => c.value)}
              labels={curve.map((c, i) => curveLabel(scoring, c.solves, i === curve.length - 1))}
              sampled={curve.length < D}
              summary={describeCurve({ scoring, points: P, minPoints: M, decaySolves: D })}
              columnLabel={scoring === "race" ? "Solve" : "Solvers"}
            />
          )}
        </Section>

        <Section title="Timing and visibility" description="Leave both empty to keep the task open for the whole hunt.">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <DateTimeField
              name="unlockAt"
              label="Unlocks at"
              hint="Hidden from players until then."
              defaultValue={values.unlockAt}
              error={err("unlockAt")}
            />
            <DateTimeField
              name="lockAt"
              label="Closes at"
              hint="No new submissions after this."
              defaultValue={values.lockAt}
              error={err("lockAt")}
            />
          </div>
          <Switch
            name="hidden"
            defaultChecked={values.hidden}
            label="Hidden from players"
            hint="Keep it secret until you switch this off, e.g. a bonus task you reveal later."
          />
        </Section>
      </fieldset>

      {readOnly ? null : (
        <div
          data-bottom-bar
          className="sticky bottom-0 z-20 -mx-4 flex flex-col gap-3 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:-mx-0 md:px-0"
        >
          <FormMessage state={state} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" pending={pending} className="flex-1 sm:flex-none">
              {pending ? "Saving" : isNew ? "Create task" : "Save task"}
            </Button>
            <ButtonLink href={cancelHref} variant="ghost" size="lg">
              Cancel
            </ButtonLink>
          </div>
        </div>
      )}
    </form>
  );
}
