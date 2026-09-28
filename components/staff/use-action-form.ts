"use client";

import {
  type FormEvent,
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ActionState } from "@/lib/actions";

type Action<T> = (prev: ActionState<T>, formData: FormData) => Promise<ActionState<T>>;

const NONE: ReadonlySet<string> = new Set();

/**
 * useActionState for organizer forms, dispatched from onSubmit.
 *
 * React resets a `<form action={fn}>` after every action — including one that
 * returned validation errors — which would wipe what the organizer typed.
 * Dispatching from onSubmit keeps their input; pass `resetOnSuccess` for
 * compose-style forms that should clear after sending.
 *
 * A field's error only stays up while the field still holds the value that
 * caused it: once the organizer changes it (typing, picking, or a button such
 * as "Generate new code"), the error beside the field goes, and so does the
 * form-level message once every field it was about has changed. Changing a
 * field back brings its error back. Forms opt in by attaching `formRef`.
 */
export function useActionForm<T = unknown>(
  action: Action<T>,
  opts: { resetOnSuccess?: boolean; onSuccess?: (state: ActionState<T>) => void } = {},
) {
  const [state, dispatch, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  // What the last submit sent, to compare the form against.
  const submitted = useRef<FormData | null>(null);
  const [changed, setChanged] = useState<ReadonlySet<string>>(NONE);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(e.currentTarget, submitter);
    submitted.current = formData;
    setChanged(NONE);
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

  // Which fields with an error now hold something other than what was submitted.
  const recheck = useCallback(() => {
    const form = formRef.current;
    const before = submitted.current;
    const keys = errorFields(state);
    if (!form || !before || keys.length === 0) return;
    const now = new FormData(form);
    const next = new Set(keys.filter((k) => !sameEntries(before.getAll(k), now.getAll(k))));
    setChanged((prev) => (prev.size === next.size && [...next].every((k) => prev.has(k)) ? prev : next));
  }, [state]);

  useEffect(() => {
    const form = formRef.current;
    if (!form || errorFields(state).length === 0) return;
    // After the frame, so controlled inputs and hidden fields (dates, generated codes) hold their new values.
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(recheck);
    };
    const events = ["input", "change", "click"] as const;
    for (const type of events) form.addEventListener(type, schedule);
    return () => {
      cancelAnimationFrame(frame);
      for (const type of events) form.removeEventListener(type, schedule);
    };
  }, [state, recheck]);

  const shown = useMemo(() => withoutChanged(state, changed), [state, changed]);
  return { state: shown, pending, onSubmit, formRef };
}

/** Field names with an error (keys with a dot carry data, e.g. "slug.suggestion"). */
function errorFields(state: ActionState<unknown>): string[] {
  if (!state || state.ok || !state.fieldErrors) return [];
  return Object.keys(state.fieldErrors).filter((k) => !k.includes("."));
}

function sameEntries(a: FormDataEntryValue[], b: FormDataEntryValue[]): boolean {
  return (
    a.length === b.length &&
    a.every((v, i) => {
      const w = b[i];
      if (typeof v === "string" || typeof w === "string") return v === w;
      return v.name === w.name && v.size === w.size && v.lastModified === w.lastModified;
    })
  );
}

/** The state without errors for fields that changed since; null when nothing is left to report. */
function withoutChanged<T>(state: ActionState<T>, changed: ReadonlySet<string>): ActionState<T> {
  if (changed.size === 0 || !state || state.ok || !state.fieldErrors) return state;
  const left = Object.entries(state.fieldErrors).filter(([k]) => !changed.has(k.split(".")[0]));
  if (!left.some(([k]) => !k.includes("."))) return null;
  return { ...state, fieldErrors: Object.fromEntries(left) };
}
