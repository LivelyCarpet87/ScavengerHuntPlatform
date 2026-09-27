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

/**
 * Form-level result message for an ActionState (field errors render next to
 * their fields). The success status region stays mounted, empty and out of
 * the layout, so screen readers announce "Settings saved" when it appears (a
 * live region inserted together with its text is often skipped). Errors are
 * alerts, which are announced on insertion.
 */
export function FormMessage({ state, className }: { state: ActionState; className?: string }) {
  const success = state?.ok ? state.message : null;
  return (
    <>
      <output
        className={cn(
          success ? "flex items-center gap-2 text-sm font-medium text-forest" : "sr-only",
          success && className,
        )}
      >
        {success ? (
          <>
            <CircleCheck aria-hidden className="size-4 shrink-0" />
            {success}
          </>
        ) : null}
      </output>
      {state && !state.ok ? (
        <p role="alert" className={cn("flex items-start gap-2 text-sm font-medium text-danger", className)}>
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      ) : null}
    </>
  );
}

/** Field error lookup for ActionState. */
export function fieldError(state: ActionState, name: string): string | undefined {
  return state && !state.ok ? state.fieldErrors?.[name] : undefined;
}
