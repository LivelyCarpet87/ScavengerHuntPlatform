"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import type { ActionState } from "@/lib/actions";

/**
 * Runs `onDone` once for each successful action result (e.g. close a dialog
 * and show a toast), no matter how often the component re-renders.
 */
export function useActionDone<T>(state: ActionState<T>, onDone: (message: string | undefined) => void) {
  const handled = useRef<ActionState<T>>(null);
  const done = useEffectEvent(onDone);
  useEffect(() => {
    if (state?.ok && handled.current !== state) {
      handled.current = state;
      done(state.message);
    }
  }, [state]);
}
