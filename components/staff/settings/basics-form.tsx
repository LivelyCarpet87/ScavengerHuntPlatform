"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form";
import type { Accent } from "@/lib/db/schema";
import { formLevel } from "@/lib/staff/forms";
import { updateBasicsAction } from "@/lib/staff/hunt-actions";
import { AccentPicker } from "../accent-picker";
import { MarkdownField } from "../markdown-field";
import { SlugField } from "../slug-field";
import { useActionForm } from "../use-action-form";

/** Name, link, tagline, intro and map color. */
export function BasicsForm({
  huntId,
  origin,
  values,
}: {
  huntId: string;
  origin: string;
  values: { name: string; slug: string; tagline: string | null; description: string; accent: Accent };
}) {
  const { state, pending, onSubmit, formRef } = useActionForm(updateBasicsAction);
  const [slug, setSlug] = useState(values.slug);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-5">
      <input type="hidden" name="huntId" value={huntId} />
      <Field label="Hunt name" error={fieldError(state, "name")}>
        {(p) => <Input {...p} name="name" defaultValue={values.name} maxLength={80} required />}
      </Field>
      <SlugField
        value={slug}
        onChange={setSlug}
        origin={origin}
        huntId={huntId}
        originalSlug={values.slug}
        error={fieldError(state, "slug")}
        suggestion={fieldError(state, "slug.suggestion")}
        hint="The hunt’s address. Players see it in the address bar and inside printed QR codes."
      />
      <Field
        label="Tagline"
        hint="One line under the name, e.g. “Twelve controls, two hours, bring a torch.”"
        error={fieldError(state, "tagline")}
      >
        {(p) => <Input {...p} name="tagline" defaultValue={values.tagline ?? ""} maxLength={140} />}
      </Field>
      <MarkdownField
        name="description"
        label="Introduction"
        hint="Shown on the hunt’s page before players join: meeting point, rules, what to bring."
        defaultValue={values.description}
        rows={7}
        maxLength={10_000}
        error={fieldError(state, "description")}
      />
      <AccentPicker defaultValue={values.accent} hint="Used for buttons, control circles and the big screen." />
      <FormMessage state={formLevel(state, ["name", "slug", "tagline", "description"])} />
      <Button type="submit" variant="secondary" pending={pending} className="self-start">
        Save basics
      </Button>
    </form>
  );
}
