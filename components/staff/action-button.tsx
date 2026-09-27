"use client";

import { type ReactNode, useEffect } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/actions";
import { useActionForm } from "./use-action-form";

/**
 * A one-button form for a server action that needs no confirmation
 * (duplicate, pin, make captain…). Shows progress on the button and reports
 * the result in a toast.
 */
export function ActionButton({
  action,
  fields,
  children,
  variant = "secondary",
  size = "md",
  className,
  pendingLabel,
  ariaLabel,
  quietSuccess = false,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  pendingLabel?: string;
  ariaLabel?: string;
  /** Don't toast on success (the page itself shows the change). */
  quietSuccess?: boolean;
}) {
  const { state, pending, onSubmit } = useActionForm(action, {
    onSuccess: (s) => {
      if (!quietSuccess && s?.ok && s.message) toast({ title: s.message, tone: "success" });
    },
  });
  useEffect(() => {
    if (state && !state.ok) toast({ title: state.error, tone: "danger" });
  }, [state]);
  return (
    <form onSubmit={onSubmit} className="contents">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button
        type="submit"
        variant={variant}
        size={size}
        className={className}
        pending={pending}
        aria-label={ariaLabel}
      >
        {pending && pendingLabel ? pendingLabel : children}
      </Button>
    </form>
  );
}
