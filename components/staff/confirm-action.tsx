"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/actions";
import { useActionForm } from "./use-action-form";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * A button that asks before running a server action: the dialog says exactly
 * what will happen, and optionally makes the organizer type a name first.
 * Closes (with a toast) on success; actions that redirect simply navigate.
 * Every opening starts fresh: no message or typed name left over from last time.
 */
export function ConfirmAction({
  action,
  fields,
  label,
  icon,
  variant = "secondary",
  size = "md",
  className,
  title,
  description,
  confirmLabel,
  confirmVariant = "danger",
  typeToConfirm,
  children,
  disabled,
}: {
  action: Action;
  /** Hidden inputs sent with the action. */
  fields: Record<string, string>;
  label: ReactNode;
  icon?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  confirmVariant?: ButtonVariant;
  /** When set, the confirm button unlocks only after this text is typed. */
  typeToConfirm?: string;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => {
          setRound((r) => r + 1);
          setOpen(true);
        }}
        disabled={disabled}
      >
        {icon}
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} description={description}>
        <ConfirmForm
          key={round}
          action={action}
          fields={fields}
          open={open}
          onCancel={() => setOpen(false)}
          onDone={(s) => {
            setOpen(false);
            if (s?.ok && s.message) toast({ title: s.message, tone: "success" });
          }}
          confirmLabel={confirmLabel}
          confirmVariant={confirmVariant}
          typeToConfirm={typeToConfirm}
        >
          {children}
        </ConfirmForm>
      </Dialog>
    </>
  );
}

function ConfirmForm({
  action,
  fields,
  open,
  onCancel,
  onDone,
  confirmLabel,
  confirmVariant,
  typeToConfirm,
  children,
}: {
  action: Action;
  fields: Record<string, string>;
  open: boolean;
  onCancel: () => void;
  onDone: (state: ActionState) => void;
  confirmLabel: string;
  confirmVariant: ButtonVariant;
  typeToConfirm?: string;
  children?: ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { state, pending, onSubmit, formRef } = useActionForm(action, { onSuccess: onDone });
  const matches = !typeToConfirm || normalize(typed) === normalize(typeToConfirm);

  // The dialog opens in its parent's effect (children's effects run first), so wait a frame to focus inside it.
  useEffect(() => {
    if (!open || !typeToConfirm) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, typeToConfirm]);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4 pt-2">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      {typeToConfirm ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-sm font-semibold">
            Type <span className="font-bold">{typeToConfirm}</span> to confirm
          </label>
          <Input
            ref={inputRef}
            id={inputId}
            name="confirmName"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={fieldError(state, "confirmName") ? true : undefined}
          />
        </div>
      ) : null}
      {state && !state.ok ? <FormMessage state={state} /> : null}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant={confirmVariant} pending={pending} disabled={!matches}>
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
}

function normalize(s: string) {
  return s.trim().replace(/\s+/g, " ");
}
