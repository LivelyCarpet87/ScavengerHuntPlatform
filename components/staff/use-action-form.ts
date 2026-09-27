"use client";

import { type FormEvent, startTransition, useActionState, useEffect, useEffectEvent, useRef } from "react";
import type { ActionState } from "@/lib/actions";

type Action<T> = (prev: ActionState<T>, formData: FormData) => Promise<ActionState<T>>;

/**
 * useActionState for organizer forms, dispatched from onSubmit.
 *
 * React resets a `<form action={fn}>` after every action — including one that
 * returned validation errors — which would wipe what the organizer typed.
 * Dispatching from onSubmit keeps their input; pass `resetOnSuccess` for
 * compose-style forms that should clear after sending.
 */
export function useActionForm<T = unknown>(
  action: Action<T>,
  opts: { resetOnSuccess?: boolean; onSuccess?: (state: ActionState<T>) => void } = {},
) {
  const [state, dispatch, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  };

  const handleResult = useEffectEvent((s: ActionState<T>) => {
    if (!s) return;
    if (!s.ok) {
      // Take the organizer straight to the first field that needs fixing.
      if (s.fieldErrors) {
        requestAnimationFrame(() => {
          const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
          invalid?.focus();
        });
      }
      return;
    }
    if (opts.resetOnSuccess) formRef.current?.reset();
    opts.onSuccess?.(s);
  });
  useEffect(() => {
    handleResult(state);
  }, [state]);

  return { state, pending, onSubmit, formRef };
}
