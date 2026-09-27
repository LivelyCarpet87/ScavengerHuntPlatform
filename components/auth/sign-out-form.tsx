"use client";

import type { ReactNode } from "react";
import { forgetThisDevice } from "@/components/pwa/forget";
import { signOutAction } from "@/lib/auth/actions";

/**
 * A sign-out form: wrap the button that signs out. Before the server action
 * runs it forgets the pages and photos saved on this device, so the next person
 * on a shared phone can't open staff photos or pages offline. Without
 * JavaScript it still signs out.
 *
 *   <SignOutForm><button type="submit">Sign out</button></SignOutForm>
 *   <SignOutForm action={signOutAndReturnAction} next="/invite/…">…</SignOutForm>
 */
export function SignOutForm({
  action = signOutAction,
  next,
  className,
  children,
}: {
  action?: (formData: FormData) => Promise<void>;
  /** Where to come back to, for actions that read a `next` field. */
  next?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form action={action} onSubmit={() => void forgetThisDevice()} className={className}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {children}
    </form>
  );
}
