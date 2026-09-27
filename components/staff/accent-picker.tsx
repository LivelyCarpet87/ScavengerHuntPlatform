import { useId } from "react";
import type { Accent } from "@/lib/db/schema";
import { ACCENT_SWATCHES } from "@/lib/palette";
import { cn } from "@/lib/utils";

// From the palette rather than the schema, so the browser bundle doesn't pull in the database layer.
const ACCENTS = Object.keys(ACCENT_SWATCHES) as Accent[];

/**
 * The hunt's map color, as labelled swatch radios. Swatches are painted with
 * the accent token itself (via data-accent), so they match the real UI in
 * both Day and Night-O.
 */
export function AccentPicker({
  name = "accent",
  defaultValue = "overprint",
  value,
  onChange,
  legend = "Map color",
  hint,
}: {
  name?: string;
  defaultValue?: Accent;
  /** Controlled selection (pair with onChange). */
  value?: Accent;
  onChange?: (accent: Accent) => void;
  legend?: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-semibold text-ink">{legend}</legend>
      {hint ? <p className="text-sm text-ink-2">{hint}</p> : null}
      <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ACCENTS.map((accent) => (
          <label
            key={accent}
            htmlFor={`${id}-${accent}`}
            className="group flex h-12 cursor-pointer items-center gap-3 rounded-md bg-mist px-3 text-sm font-semibold text-ink-2 transition-colors hover:bg-mist-2 hover:text-ink has-checked:bg-paper has-checked:text-ink has-checked:shadow-[inset_0_0_0_2px_var(--ink)] has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-overprint"
          >
            <input
              id={`${id}-${accent}`}
              type="radio"
              name={name}
              value={accent}
              {...(value !== undefined
                ? { checked: value === accent, onChange: () => onChange?.(accent) }
                : { defaultChecked: defaultValue === accent, onChange: onChange ? () => onChange(accent) : undefined })}
              className="sr-only"
            />
            <span
              aria-hidden
              data-accent={accent === "overprint" ? undefined : accent}
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full",
                accent === "overprint" ? "bg-overprint" : "bg-accent",
              )}
            >
              <span className="hidden size-2 rounded-full bg-paper group-has-checked:block" />
            </span>
            <span className="min-w-0 truncate">{ACCENT_SWATCHES[accent].label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
