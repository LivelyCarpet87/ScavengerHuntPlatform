"use client";

import { CopyPlus } from "lucide-react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { duplicateHuntAction } from "@/lib/staff/hunt-actions";
import { useActionForm } from "./use-action-form";

/** Copies a hunt's settings, tasks and hints into a new draft, then opens it. */
export function DuplicateHuntButton({
  huntId,
  huntName,
  variant = "ghost",
  size = "sm",
  label = "Duplicate",
}: {
  huntId: string;
  huntName: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  label?: string;
}) {
  const { state, pending, onSubmit } = useActionForm(duplicateHuntAction);
  return (
    <form onSubmit={onSubmit} className="contents">
      <input type="hidden" name="huntId" value={huntId} />
      <Button type="submit" variant={variant} size={size} pending={pending}>
        {pending ? null : <CopyPlus aria-hidden />}
        {pending ? "Copying" : label}
        {/* The visible label comes first, so voice control ("click Duplicate") still matches. */}
        <span className="sr-only"> “{huntName}”</span>
      </Button>
      {state && !state.ok ? <FormMessage state={state} className="basis-full" /> : null}
    </form>
  );
}
