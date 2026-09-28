"use client";

import { CircleCheck } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { linkish, tidySlug } from "@/lib/staff/forms";
import { checkSlugAction, type SlugCheck } from "@/lib/staff/hunt-actions";

/**
 * Checks the link while the organizer types (debounced), so a taken or
 * malformed link shows up before they submit. Answers for older values are
 * ignored, and nothing is checked while the link equals `skip` (the hunt's
 * current link in Settings).
 */
function useSlugCheck(slug: string, huntId: string | undefined, skip: string | undefined): SlugCheck | null {
  const [result, setResult] = useState<SlugCheck | null>(null);
  useEffect(() => {
    if (slug.length < 3 || slug === skip) return;
    let current = true;
    const timer = setTimeout(() => {
      checkSlugAction({ slug, huntId })
        .then((check) => {
          if (current) setResult(check);
        })
        .catch(() => {
          // Offline or signed out: the form still validates on submit.
        });
    }, 450);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [slug, huntId, skip]);
  return result && result.slug === slug && slug !== skip ? result : null;
}

/**
 * The hunt link field: origin prefix, live availability, and a one-tap fix
 * when the link is taken. Controlled; submits as `name`.
 */
export function SlugField({
  value,
  onChange,
  origin,
  huntId,
  originalSlug,
  error,
  suggestion,
  hint = "Players see this in the address bar and on printed QR codes. Lowercase letters, numbers and dashes.",
  name = "slug",
}: {
  value: string;
  onChange: (value: string) => void;
  /** Host shown in front of the link, e.g. "hunt.example.com". */
  origin: string;
  /** Editing an existing hunt: its own link counts as free. */
  huntId?: string;
  /** The saved link, which needs no check (and warns when changed). */
  originalSlug?: string;
  /** Error from the last submit. */
  error?: string;
  /** Free alternative from the last submit. */
  suggestion?: string;
  hint?: string;
  name?: string;
}) {
  const id = useId();
  const check = useSlugCheck(value, huntId, originalSlug);
  const live =
    check?.status === "taken"
      ? { tone: "error" as const, text: "Another hunt already uses this link.", suggestion: check.suggestion }
      : check?.status === "invalid"
        ? { tone: "error" as const, text: check.message, suggestion: undefined }
        : check?.status === "free"
          ? { tone: "ok" as const, text: "This link is free.", suggestion: undefined }
          : null;
  // A fresh check beats the last submit's error (the organizer may have fixed it already).
  const message = live ?? (error ? { tone: "error" as const, text: error, suggestion } : null);
  const invalid = message?.tone === "error";
  const changed = originalSlug != null && value !== originalSlug;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        Link
      </label>
      <p id={`${id}-hint`} className="-mt-1 text-sm text-ink-2">
        {hint}
      </p>
      <div className="flex h-12 items-center rounded-md bg-mist transition-[box-shadow,background-color] hover:bg-mist-2 focus-within:bg-paper focus-within:shadow-[inset_0_0_0_2px_var(--ink)] has-aria-invalid:shadow-[inset_0_0_0_2px_var(--danger)]">
        <span className="shrink-0 pl-3.5 text-ink-3 select-none">
          <span className="hidden sm:inline">{origin}</span>/h/
        </span>
        <input
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(linkish(e.target.value))}
          onBlur={() => {
            const tidy = tidySlug(value);
            if (tidy !== value) onChange(tidy);
          }}
          required
          minLength={3}
          maxLength={48}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby={`${id}-hint${message ? ` ${id}-status` : ""}`}
          aria-invalid={invalid ? true : undefined}
          className="h-full min-w-0 flex-1 bg-transparent pr-3.5 text-base text-ink focus:outline-none"
        />
      </div>
      <div id={`${id}-status`} aria-live="polite" className="empty:hidden">
        {message ? (
          <p
            className={
              message.tone === "ok"
                ? "flex items-center gap-1.5 text-sm font-medium text-forest"
                : "text-sm font-medium text-danger"
            }
          >
            {message.tone === "ok" ? <CircleCheck aria-hidden className="size-4 shrink-0" /> : null}
            {message.text}
          </p>
        ) : null}
      </div>
      {message?.suggestion ? (
        <Button variant="quiet" size="sm" className="self-start" onClick={() => onChange(message.suggestion as string)}>
          Use {message.suggestion}
        </Button>
      ) : null}
      {changed ? (
        <Notice tone="warning" title="Printed QR codes use the old link" className="mt-1">
          Checkpoint posters and team cards you’ve already printed stop working after you save. The hunt code keeps
          working.
        </Notice>
      ) : null}
    </div>
  );
}
