"use client";

import { type RefObject, useEffect } from "react";
import type { ActionState } from "@/lib/actions";

/*
 * Small helpers shared by the join and team forms, so a failed submit reads
 * the same everywhere: the problem next to its field, a short pointer by the
 * button, and keyboard focus on the first field to fix.
 */

/** Field-error keys that carry data for the UI rather than a problem to show. */
const DATA_KEYS = new Set(["nameSuggestion"]);

/**
 * The message next to the submit button. When every problem is already shown
 * next to a field on screen, it points there instead of repeating it.
 */
export function formSummary<T>(state: ActionState<T>, visibleFields: string[]): ActionState<T> {
  if (!state || state.ok || !state.fieldErrors) return state;
  const keys = Object.keys(state.fieldErrors).filter((k) => !DATA_KEYS.has(k));
  if (keys.length === 0 || !keys.every((k) => visibleFields.includes(k))) return state;
  return {
    ok: false,
    error:
      keys.length === 1 ? "Fix the highlighted field, then try again." : "Fix the highlighted fields, then try again.",
  };
}

/**
 * After a failed submit, moves focus to the first invalid field and centers
 * it, so its message (and any suggestion under it) isn't hidden behind a
 * sticky action bar or the phone keyboard.
 */
export function useFocusFirstError(formRef: RefObject<HTMLFormElement | null>, state: ActionState<unknown>) {
  useEffect(() => {
    if (!state || state.ok || !state.fieldErrors) return;
    const field = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!field) return;
    field.focus({ preventScroll: true });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    field.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [state, formRef]);
}

/** A success message as a toast title: short, without the closing period. */
export function toastTitle(message: string | undefined, fallback: string): string {
  return (message ?? fallback).replace(/\.$/, "");
}
