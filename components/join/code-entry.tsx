"use client";

import { CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { QrScanButton } from "@/components/scan/qr-scanner";
import { SubmitButton } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/actions";
import { findHuntByCode } from "@/lib/player/actions";
import { HUNT_CODE_LENGTH, parseHuntInput, sanitizeCodeTyping } from "@/lib/player/join";
import { cn } from "@/lib/utils";

/**
 * The hunt code, entered like a game PIN: six big digits in control-card
 * boxes. One real <input> sits over the boxes, so typing, pasting, autofill
 * and screen readers all work as usual. A full code (typed, pasted or
 * scanned) is looked up right away; pasted or scanned links into a hunt on
 * this server are simply opened.
 */
export function CodeEntry({
  defaultCode = "",
  initialError,
  autoFocus,
  className,
}: {
  defaultCode?: string;
  /** Shown until the code is edited (e.g. /join/[code] with an unknown code). */
  initialError?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const id = useId();
  const [state, formAction] = useActionState<ActionState, FormData>(
    findHuntByCode,
    initialError ? { ok: false, error: initialError } : null,
  );
  const [code, setCode] = useState(() => sanitizeCodeTyping(defaultCode));
  const [focused, setFocused] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** The code the current server error belongs to; editing hides the error. */
  const [erroredCode, setErroredCode] = useState<string | null>(initialError ? sanitizeCodeTyping(defaultCode) : null);
  const lastSubmitted = useRef<string | null>(initialError ? sanitizeCodeTyping(defaultCode) : null);
  const autoSubmit = useRef(false);

  // A server error belongs to the code that was sent.
  useEffect(() => {
    if (state && !state.ok) setErroredCode(lastSubmitted.current);
  }, [state]);

  // Look the code up as soon as the sixth digit arrives (typed, pasted or scanned).
  useEffect(() => {
    if (!autoSubmit.current) return;
    autoSubmit.current = false;
    if (code.length === HUNT_CODE_LENGTH && code !== lastSubmitted.current) formRef.current?.requestSubmit();
  }, [code]);

  const update = (next: string) => {
    autoSubmit.current = true;
    setLocalError(null);
    setCode(next);
  };

  /** Links into this app open directly; anything else is read as a code. */
  const accept = (text: string): boolean => {
    const parsed = parseHuntInput(text, window.location.origin);
    if (parsed.kind === "path") {
      router.push(parsed.path);
      return true;
    }
    if (parsed.kind === "code") {
      update(parsed.code);
      return true;
    }
    return false;
  };

  const serverError = state && !state.ok && erroredCode === code ? state.error : null;
  const error = localError ?? serverError;
  const activeIndex = Math.min(code.length, HUNT_CODE_LENGTH - 1);

  const box = (i: number) => {
    const digit = code[i];
    const active = focused && i === activeIndex && code.length < HUNT_CODE_LENGTH;
    return (
      <span
        key={i}
        className={cn(
          "relative grid h-[4.25rem] min-w-0 flex-1 place-items-center rounded-md border-2 font-bib text-5xl leading-none transition-colors duration-150 sm:h-24 sm:text-7xl",
          digit ? "border-accent bg-accent-wash text-ink" : "border-line-strong bg-paper text-ink-3",
          active && "border-ink",
          error && "border-danger",
        )}
      >
        {digit ?? ""}
        {active ? (
          <span className="absolute inset-x-2.5 bottom-2 h-[3px] rounded-full bg-accent sm:inset-x-4 sm:bottom-3" />
        ) : null}
      </span>
    );
  };

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(e) => {
        if (code.length < HUNT_CODE_LENGTH) {
          e.preventDefault();
          setLocalError("Enter all six digits of the hunt code.");
          inputRef.current?.focus();
          return;
        }
        lastSubmitted.current = code;
      }}
      className={cn("flex flex-col", className)}
    >
      <label htmlFor={id} className="sr-only">
        Hunt code, six digits
      </label>
      <div className="relative rounded-lg has-focus-visible:outline-3 has-focus-visible:outline-offset-4 has-focus-visible:outline-overprint">
        <div aria-hidden className="flex items-stretch gap-1.5 sm:gap-2">
          {[0, 1, 2].map(box)}
          <span className="w-1.5 shrink-0 sm:w-3" />
          {[3, 4, 5].map(box)}
        </div>
        <input
          ref={inputRef}
          id={id}
          name="code"
          value={code}
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          // biome-ignore lint/a11y/noAutofocus: only on the "code not found" page, where fixing the code is the one job
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onFocus={(e) => {
            setFocused(true);
            const end = e.currentTarget.value.length;
            e.currentTarget.setSelectionRange(end, end);
          }}
          onBlur={() => setFocused(false)}
          onPaste={(e) => {
            if (accept(e.clipboardData.getData("text"))) e.preventDefault();
          }}
          onChange={(e) => {
            const raw = e.target.value;
            // Autofill or a dropped link can put a whole URL here.
            if (/\D/.test(raw) && raw.length > HUNT_CODE_LENGTH && accept(raw)) return;
            update(sanitizeCodeTyping(raw));
          }}
          className="absolute inset-0 size-full cursor-text rounded-md bg-transparent text-base text-transparent caret-transparent opacity-0 outline-none"
        />
      </div>

      <div className="min-h-7 pt-2" aria-live="polite">
        {error ? (
          <p id={`${id}-error`} className="flex items-start justify-center gap-1.5 text-sm font-medium text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>

      <div className="mt-2 flex flex-col gap-2.5">
        <SubmitButton size="lg" className="w-full" pendingLabel="Finding hunt">
          Find hunt
        </SubmitButton>
        <QrScanButton
          size="lg"
          variant="secondary"
          className="w-full"
          onResult={(text) => {
            if (accept(text)) return true;
            toast({
              title: "That QR code isn’t for a hunt",
              description: "Scan the code on the hunt poster, or type its six digits.",
              tone: "danger",
            });
            return false;
          }}
        />
      </div>
    </form>
  );
}
