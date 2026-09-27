import { type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

/*
 * Radio choices rendered as selectable cards (for decisions that deserve an
 * explanation, like task type or scoring mode) or as a compact segmented row.
 * Native radios underneath: they submit with forms and work with keyboards.
 */

export type ChoiceOption = { value: string; label: ReactNode; description?: ReactNode; icon?: ReactNode };

export function ChoiceCards({
  name,
  options,
  defaultValue,
  className,
  columns = 2,
  onChange,
}: {
  name: string;
  options: ChoiceOption[];
  defaultValue?: string;
  className?: string;
  columns?: 1 | 2 | 3 | 4;
  onChange?: (value: string) => void;
}) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      className={cn(
        "grid gap-2",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {options.map((opt) => (
        <label
          key={opt.value}
          htmlFor={`${id}-${opt.value}`}
          className="group relative flex cursor-pointer gap-3 rounded-lg bg-mist p-3.5 transition-colors hover:bg-mist-2 has-checked:bg-accent-wash has-checked:shadow-[inset_0_0_0_2px_var(--accent)] has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-overprint"
        >
          <input
            id={`${id}-${opt.value}`}
            type="radio"
            name={name}
            value={opt.value}
            defaultChecked={defaultValue === opt.value}
            onChange={onChange ? () => onChange(opt.value) : undefined}
            className="sr-only"
          />
          {opt.icon ? <span className="mt-0.5 text-ink-2 group-has-checked:text-accent">{opt.icon}</span> : null}
          <span className="flex min-w-0 flex-col">
            <span className="font-semibold">{opt.label}</span>
            {opt.description ? <span className="mt-0.5 text-sm text-ink-2">{opt.description}</span> : null}
          </span>
        </label>
      ))}
    </div>
  );
}

export function Segmented({
  name,
  options,
  defaultValue,
  className,
  onChange,
  size = "md",
}: {
  name: string;
  options: { value: string; label: ReactNode }[];
  defaultValue?: string;
  className?: string;
  onChange?: (value: string) => void;
  size?: "sm" | "md";
}) {
  const id = useId();
  return (
    <div role="radiogroup" className={cn("inline-flex rounded-md bg-mist p-1", className)}>
      {options.map((opt) => (
        <label
          key={opt.value}
          htmlFor={`${id}-${opt.value}`}
          className={cn(
            "flex cursor-pointer items-center justify-center rounded-sm px-3 font-semibold text-ink-2 transition-colors hover:text-ink has-checked:bg-paper has-checked:text-ink has-checked:shadow-sm has-focus-visible:outline-3 has-focus-visible:outline-overprint",
            size === "sm" ? "h-8 text-sm" : "h-10 text-[0.9375rem]",
          )}
        >
          <input
            id={`${id}-${opt.value}`}
            type="radio"
            name={name}
            value={opt.value}
            defaultChecked={defaultValue === opt.value}
            onChange={onChange ? () => onChange(opt.value) : undefined}
            className="sr-only"
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}
