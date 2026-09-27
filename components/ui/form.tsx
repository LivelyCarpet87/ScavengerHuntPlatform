"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/** Submit button that shows progress while its parent <form> action runs. */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" pending={pending} {...props}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

/** Form-level result message for an ActionState (field errors render next to their fields). */
export function FormMessage({ state, className }: { state: ActionState; className?: string }) {
  if (!state) return null;
  if (state.ok) {
    if (!state.message) return null;
    return (
      <output className={cn("flex items-center gap-2 text-sm font-medium text-forest", className)}>
        <CircleCheck aria-hidden className="size-4 shrink-0" />
        {state.message}
      </output>
    );
  }
  return (
    <p role="alert" className={cn("flex items-start gap-2 text-sm font-medium text-danger", className)}>
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {state.error}
    </p>
  );
}

/** Field error lookup for ActionState. */
export function fieldError(state: ActionState, name: string): string | undefined {
  return state && !state.ok ? state.fieldErrors?.[name] : undefined;
}
