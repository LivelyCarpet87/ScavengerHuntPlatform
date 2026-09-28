"use client";

import { useEffect } from "react";
import { buttonClass } from "@/components/ui/button";
import { StatusGlyph } from "@/components/ui/status";
import { UNDO_WINDOW_MS } from "@/lib/judging/constants";
import { cn } from "@/lib/utils";
import { KeyHint } from "./key-hint";

export type UndoToastState = {
  key: number;
  status: "approved" | "rejected";
  message: string;
  /** Change to the team's score, shown in bib numerals, e.g. "+100". */
  delta: string | null;
};

/**
 * "Approved Night Owls. Undo" — sits above the phone action bar, bottom-center
 * of the workspace on desktop, and dismisses itself after UNDO_WINDOW_MS.
 */
export function UndoToast({
  state,
  onUndo,
  onDismiss,
  undoing,
  singleKeys = true,
}: {
  state: UndoToastState | null;
  onUndo: () => void;
  onDismiss: () => void;
  undoing?: boolean;
  /** Whether the U shortcut is on (Ctrl/⌘ Z always works). */
  singleKeys?: boolean;
}) {
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(onDismiss, UNDO_WINDOW_MS);
    return () => clearTimeout(t);
  }, [state, onDismiss]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 md:left-64 lg:bottom-6"
    >
      {state ? (
        <div
          key={state.key}
          className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg bg-raised py-1.5 pr-1.5 pl-4 text-ink shadow-pop animate-pop"
        >
          <StatusGlyph
            status={state.status}
            className={cn("size-4", state.status === "approved" ? "text-forest" : "text-danger")}
          />
          <p className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">
            {state.message}
            {state.delta ? <span className="ml-2 font-bib text-lg">{state.delta}</span> : null}
          </p>
          <button
            type="button"
            onClick={onUndo}
            disabled={undoing}
            className={buttonClass("quiet", "md", "shrink-0")}
            aria-keyshortcuts={singleKeys ? "U Control+Z Meta+Z" : "Control+Z Meta+Z"}
          >
            Undo
            {singleKeys ? <KeyHint k="U" className="hidden lg:inline-flex" /> : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}
