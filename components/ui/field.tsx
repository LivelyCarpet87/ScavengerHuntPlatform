import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

/*
 * Form controls. Inputs are 48px tall on phones (thumbs, gloves, sunlight),
 * sit on the sunken "mist" surface and get an ink ring on focus. Pair every
 * control with a visible label via <Field>.
 */

const control =
  "w-full rounded-md border border-transparent bg-mist px-3.5 text-base text-ink placeholder:text-ink-3 " +
  "transition-[box-shadow,background-color] duration-150 hover:bg-mist-2 " +
  "focus:bg-paper focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)] " +
  "aria-invalid:shadow-[inset_0_0_0_2px_var(--danger)] disabled:opacity-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-12", className)} {...props} />;
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cn(control, "min-h-24 py-3 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(control, "h-12 appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-ink-2"
      >
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

type FieldProps = {
  label: ReactNode;
  /** Shown under the label; explains what the value is for. */
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  /** Render prop receives the generated id + aria wiring for the control. */
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
};

/** Label + control + hint + error, wired for screen readers. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="-mt-1 text-sm text-ink-2">
          {hint}
        </p>
      ) : null}
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type CheckProps = Omit<ComponentProps<"input">, "type"> & { label: ReactNode; hint?: ReactNode };

/** Checkbox with a label and optional hint, as one large tap target. */
export function Checkbox({ label, hint, className, id, ...props }: CheckProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label htmlFor={inputId} className={cn("flex cursor-pointer items-start gap-3 py-1", className)}>
      <input
        id={inputId}
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 cursor-pointer rounded-xs accent-[var(--accent)]"
        {...props}
      />
      <span className="flex flex-col">
        <span className="font-medium text-ink">{label}</span>
        {hint ? <span className="text-sm text-ink-2">{hint}</span> : null}
      </span>
    </label>
  );
}

/** On/off switch built on a checkbox (submits "on" when checked). */
export function Switch({ label, hint, className, id, ...props }: CheckProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label htmlFor={inputId} className={cn("flex cursor-pointer items-center justify-between gap-4 py-1", className)}>
      <span className="flex flex-col">
        <span className="font-medium text-ink">{label}</span>
        {hint ? <span className="text-sm text-ink-2">{hint}</span> : null}
      </span>
      <span className="relative inline-flex shrink-0">
        <input id={inputId} type="checkbox" className="peer sr-only" {...props} />
        <span
          aria-hidden
          className="h-7 w-12 rounded-full bg-line-strong transition-colors duration-150 peer-checked:bg-accent peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-overprint peer-disabled:opacity-50"
        />
        <span
          aria-hidden
          className="absolute top-1 left-1 size-5 rounded-full bg-paper shadow-sm transition-transform duration-150 peer-checked:translate-x-5"
        />
      </span>
    </label>
  );
}
