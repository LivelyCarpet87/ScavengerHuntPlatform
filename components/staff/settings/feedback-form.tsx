"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form";
import { formLevel } from "@/lib/staff/forms";
import { updateFeedbackTemplatesAction } from "@/lib/staff/hunt-actions";
import { parseLines } from "@/lib/staff/text";
import { useActionForm } from "../use-action-form";

/** Canned judge feedback: one message per line, shown as one-tap chips in the judging queue. */
export function FeedbackForm({ huntId, templates }: { huntId: string; templates: string[] }) {
  const { state, pending, onSubmit, formRef } = useActionForm(updateFeedbackTemplatesAction);
  const [text, setText] = useState(templates.join("\n"));
  const chips = parseLines(text);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="huntId" value={huntId} />
      <Field
        label="Quick feedback"
        hint="One message per line, up to 12. Judges tap one to send it with their decision."
        error={fieldError(state, "feedbackTemplates")}
      >
        {(p) => (
          <Textarea
            {...p}
            name="feedbackTemplates"
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Great shot!\nWe need the whole team in the photo."}
          />
        )}
      </Field>
      {chips.length > 0 ? (
        <div>
          <p className="mb-2 text-sm text-ink-2">How judges will see them:</p>
          <ul className="flex flex-wrap gap-2" aria-label="Preview of feedback buttons">
            {chips.slice(0, 12).map((c) => (
              <li
                key={c}
                className="max-w-full truncate rounded-full bg-mist px-3 py-1.5 text-sm font-medium shadow-[inset_0_0_0_1px_var(--line-strong)]"
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <FormMessage state={formLevel(state, ["feedbackTemplates"])} />
      <Button type="submit" variant="secondary" pending={pending} className="self-start">
        Save feedback messages
      </Button>
    </form>
  );
}
