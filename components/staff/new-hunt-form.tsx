"use client";

import { type ReactNode, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChoiceCards, type ChoiceOption } from "@/components/ui/choice";
import { DateTimeField } from "@/components/ui/datetime-field";
import { Field, Input } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form";
import type { Accent } from "@/lib/db/schema";
import { slugify } from "@/lib/ids";
import { createHuntAction } from "@/lib/staff/hunt-actions";
import { AccentPicker } from "./accent-picker";
import { CourseOverprint } from "./course-overprint";
import { SlugField } from "./slug-field";
import { useActionForm } from "./use-action-form";

/**
 * New hunt: name and link, schedule, starting point and map color, with a
 * live preview of the hunt's map (its real terrain: the id is generated when
 * the page renders and used for the new hunt).
 */
export function NewHuntForm({
  huntId,
  terrain,
  origin,
  options,
  taskCounts,
  templateAccents,
  initialTemplate,
}: {
  huntId: string;
  /** The hunt's contour art, rendered on the server. */
  terrain: ReactNode;
  /** Host shown in front of the link, e.g. "hunt.example.com". */
  origin: string;
  options: ChoiceOption[];
  taskCounts: Record<string, number>;
  templateAccents: Record<string, Accent>;
  initialTemplate: string;
}) {
  const { state, pending, onSubmit, formRef } = useActionForm(createHuntAction);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [template, setTemplate] = useState(initialTemplate);
  const [accent, setAccent] = useState<Accent>(templateAccents[initialTemplate] ?? "overprint");
  const [accentTouched, setAccentTouched] = useState(false);
  const [timezone, setTimezone] = useState("");
  const slugId = useId();

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
  }, []);

  const taskCount = taskCounts[template] ?? 0;
  const slugError = fieldError(state, "slug");
  const slugSuggestion = fieldError(state, "slug.suggestion");

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      data-accent={accent}
      className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <input type="hidden" name="huntId" value={huntId} />
      <input type="hidden" name="timezone" value={timezone} />

      <aside className="min-w-0 lg:sticky lg:top-6 lg:order-last lg:self-start" aria-label="Preview">
        <div className="overflow-hidden rounded-lg border border-line bg-paper">
          <div aria-hidden className="relative h-28 border-b border-line bg-paper lg:h-40">
            {terrain}
            <CourseOverprint seed={huntId} controls={taskCount} aspect={2.4} />
          </div>
          <div className="flex flex-col gap-1 p-4">
            <span className="self-start rounded-full bg-mist-2 px-2 py-0.5 text-xs font-semibold text-ink-2">
              Draft
            </span>
            <p className="mt-1 font-cond text-2xl leading-tight font-extrabold tracking-tight break-words">
              {name.trim() || "Your hunt"}
            </p>
            <p className="truncate text-sm text-ink-2">
              {origin}/h/{slug || "…"}
            </p>
            <p className="mt-2 text-sm text-ink-2">
              {taskCount === 0 ? "Blank map: you add the tasks." : `${taskCount} tasks ready to edit`}
            </p>
          </div>
        </div>
        <p className="mt-3 hidden text-sm text-ink-3 lg:block">
          Every hunt gets its own generated terrain. Each circle is a task.
        </p>
      </aside>

      <div className="flex min-w-0 flex-col gap-10">
        <section className="flex flex-col gap-5" aria-labelledby={`${slugId}-name-h`}>
          <h2 id={`${slugId}-name-h`} className="font-cond text-2xl font-bold">
            Name and link
          </h2>
          <Field label="Hunt name" error={fieldError(state, "name")}>
            {(p) => (
              <Input
                {...p}
                name="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(e.target.value.trim() ? slugify(e.target.value) : "");
                }}
                placeholder="Campus Night Hunt"
                maxLength={80}
                required
                autoComplete="off"
              />
            )}
          </Field>
          <SlugField
            value={slug}
            onChange={(v) => {
              setSlugTouched(true);
              setSlug(v);
            }}
            origin={origin}
            error={slugError}
            suggestion={slugSuggestion}
          />
        </section>

        <section className="flex flex-col gap-5">
          <div>
            <h2 className="font-cond text-2xl font-bold">When</h2>
            <p className="mt-1 text-sm text-ink-2">
              Optional for now. Players see a countdown, and submissions close at the end.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <DateTimeField name="startsAt" label="Starts" error={fieldError(state, "startsAt")} />
            <DateTimeField name="endsAt" label="Ends" error={fieldError(state, "endsAt")} />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div>
            <h2 className="font-cond text-2xl font-bold">Start from</h2>
            <p className="mt-1 text-sm text-ink-2">
              Templates are complete courses with tasks, hints and rules. Change anything afterwards.
            </p>
          </div>
          <ChoiceCards
            name="template"
            options={options}
            defaultValue={initialTemplate}
            columns={1}
            onChange={(value) => {
              setTemplate(value);
              if (!accentTouched && templateAccents[value]) setAccent(templateAccents[value]);
            }}
          />
          {fieldError(state, "template") ? (
            <p className="text-sm font-medium text-danger">{fieldError(state, "template")}</p>
          ) : null}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-cond text-2xl font-bold">Color</h2>
          <AccentPicker
            legend="Map color"
            hint="Used for buttons, control circles and the big screen."
            value={accent}
            onChange={(a) => {
              setAccent(a);
              setAccentTouched(true);
            }}
          />
        </section>

        <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <FormMessage state={state} />
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
            <Button type="submit" size="lg" pending={pending} className="w-full md:w-auto">
              {pending ? "Creating hunt" : "Create hunt"}
            </Button>
            {/* Phones already see "Draft" on the preview; keep the sticky bar short so the fields stay visible. */}
            <p className="hidden text-sm text-ink-2 md:block">
              It starts as a draft. Only staff can see it until you publish.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}
