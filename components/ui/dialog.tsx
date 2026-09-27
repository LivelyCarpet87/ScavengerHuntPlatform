"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Modal built on the native <dialog> (focus trap, Esc and inert background
 * for free). On phones it rises as a bottom sheet; on wider screens it is a
 * centered panel.
 *
 * The title names the dialog and the description describes it. On open, focus
 * goes to the dialog itself, so screen readers start with the title and
 * description rather than "Close"; mark a control with `data-autofocus` to
 * start there instead (e.g. the field a form is about).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      (el.querySelector<HTMLElement>("[data-autofocus]") ?? el).focus();
    }
    if (!open && el.open) el.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse shortcut; Esc closes natively
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "m-0 mt-auto w-full max-w-none rounded-t-xl bg-raised p-0 text-ink shadow-pop outline-none backdrop:bg-black/45",
        "sm:m-auto sm:max-w-lg sm:rounded-xl",
        "open:animate-pop",
        className,
      )}
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div className="flex items-start gap-3 px-5 pt-5 pb-2">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-cond text-2xl font-bold">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm text-ink-2">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mt-2 -mr-3 grid size-11 shrink-0 place-items-center rounded-md text-ink-2 hover:bg-mist hover:text-ink"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </dialog>
  );
}
