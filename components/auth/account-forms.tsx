"use client";

import { type RefObject, useActionState, useEffect, useRef } from "react";
import { Field, Input } from "@/components/ui/field";
import { FormMessage, fieldError, SubmitButton } from "@/components/ui/form";
import type { ActionState } from "@/lib/actions";
import { loginAction, setupAction, signupAction } from "@/lib/platform/auth-actions";
import type { AuthFormState } from "@/lib/platform/invite-copy";
import { PasswordInput } from "./password-input";

/*
 * Sign-in, first-run setup and sign-up forms. Field errors render next to
 * their fields (and the first one gets focus); other errors render above the
 * button. Typed name/email come back from the server so a failed attempt
 * doesn't wipe them — passwords are never echoed back.
 */

function useFocusFirstError(form: RefObject<HTMLFormElement | null>, state: ActionState) {
  useEffect(() => {
    if (state && !state.ok && state.fieldErrors) {
      form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [state, form]);
}

/** The form-level message, skipped when field errors already explain the problem. */
function FormLevelMessage({ state }: { state: ActionState }) {
  if (state && !state.ok && state.fieldErrors && Object.keys(state.fieldErrors).length > 0) return null;
  return <FormMessage state={state} />;
}

function EmailField({ state, autoComplete }: { state: AuthFormState; autoComplete: string }) {
  return (
    <Field label="Email" error={fieldError(state, "email")}>
      {(p) => (
        <Input
          {...p}
          name="email"
          type="email"
          inputMode="email"
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state?.values?.email ?? ""}
        />
      )}
    </Field>
  );
}

function NameField({ state }: { state: AuthFormState }) {
  return (
    <Field label="Your name" hint="Other staff see it on the hunts you help run." error={fieldError(state, "name")}>
      {(p) => <Input {...p} name="name" autoComplete="name" defaultValue={state?.values?.name ?? ""} />}
    </Field>
  );
}

function NewPasswordField({ state }: { state: AuthFormState }) {
  return (
    <Field label="Password" hint="At least 10 characters." error={fieldError(state, "password")}>
      {(p) => <PasswordInput {...p} name="password" autoComplete="new-password" />}
    </Field>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useFocusFirstError(ref, state);
  return (
    <form ref={ref} action={action} noValidate className="flex flex-col gap-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <EmailField state={state} autoComplete="username" />
      <Field label="Password" error={fieldError(state, "password")}>
        {(p) => <PasswordInput {...p} name="password" autoComplete="current-password" />}
      </Field>
      <FormLevelMessage state={state} />
      <SubmitButton size="lg" className="w-full" pendingLabel="Signing in">
        Sign in
      </SubmitButton>
    </form>
  );
}

export function SetupForm() {
  const [state, action] = useActionState(setupAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useFocusFirstError(ref, state);
  return (
    <form ref={ref} action={action} noValidate className="flex flex-col gap-5">
      <NameField state={state} />
      <EmailField state={state} autoComplete="email" />
      <NewPasswordField state={state} />
      <FormLevelMessage state={state} />
      <SubmitButton size="lg" className="w-full" pendingLabel="Creating your account">
        Create admin account
      </SubmitButton>
    </form>
  );
}

export function SignupForm({
  invite,
  next,
  submitLabel = "Create account",
}: {
  invite?: string;
  next?: string;
  submitLabel?: string;
}) {
  const [state, action] = useActionState(signupAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useFocusFirstError(ref, state);
  return (
    <form ref={ref} action={action} noValidate className="flex flex-col gap-5">
      {invite ? <input type="hidden" name="invite" value={invite} /> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <NameField state={state} />
      <EmailField state={state} autoComplete="email" />
      <NewPasswordField state={state} />
      <FormLevelMessage state={state} />
      <SubmitButton size="lg" className="w-full" pendingLabel="Creating your account">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
