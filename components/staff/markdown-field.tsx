"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Textarea } from "@/components/ui/field";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";

/**
 * Markdown textarea with a Write / Preview switch. The textarea stays mounted
 * (just hidden) while previewing so the form always submits the text, and it
 * follows the form's reset (e.g. after sending an announcement).
 */
export function MarkdownField({
  name,
  label,
  hint,
  defaultValue = "",
  error,
  rows = 6,
  maxLength,
  placeholder,
  required,
  emptyPreview = "Nothing to preview yet.",
}: {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  defaultValue?: string;
  error?: string;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
  emptyPreview?: string;
}) {
  const id = useId();
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [value, setValue] = useState(defaultValue);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onReset = () => {
      setValue(defaultValue);
      setMode("write");
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [defaultValue]);

  const tab = (m: "write" | "preview", text: string) => (
    <button
      type="button"
      aria-pressed={mode === m}
      onClick={() => setMode(m)}
      className={cn(
        "h-8 rounded-sm px-3 text-sm font-semibold text-ink-2 transition-colors hover:text-ink",
        mode === m && "bg-paper text-ink shadow-sm",
      )}
    >
      {text}
    </button>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
        <div className="inline-flex rounded-md bg-mist p-0.5">
          {tab("write", "Write")}
          {tab("preview", "Preview")}
        </div>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="-mt-0.5 text-sm text-ink-2">
          {hint}
        </p>
      ) : null}
      <Textarea
        ref={ref}
        id={id}
        name={name}
        rows={rows}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        required={required}
        hidden={mode === "preview"}
        aria-describedby={[hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined}
        aria-invalid={error ? true : undefined}
      />
      {mode === "preview" ? (
        <div className="min-h-24 rounded-md border border-line bg-paper px-4 py-3" aria-live="polite">
          {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-ink-3">{emptyPreview}</p>}
        </div>
      ) : null}
      <p className="text-xs text-ink-3">
        Formatting: **bold**, _italic_, lines starting with “- ” become a list, [text](https://link) makes a link.
      </p>
      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
