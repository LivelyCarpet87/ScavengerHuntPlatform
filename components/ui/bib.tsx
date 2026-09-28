import type { ReactNode } from "react";
import { ordinalParts } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
 * Race-bib numerals. The team dashboard shows rank and score on a bib — the
 * number plate pinned to a runner's shirt, with its four pin holes. Use it
 * once per screen; elsewhere use <Numeral>.
 */

export function Bib({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative flex items-stretch rounded-lg border-2 border-ink bg-paper px-5 pt-4 pb-3 text-ink",
        className,
      )}
    >
      {["top-2 left-2", "top-2 right-2", "bottom-2 left-2", "bottom-2 right-2"].map((pos) => (
        <span
          key={pos}
          aria-hidden
          className={cn("absolute size-2 rounded-full border-[1.5px] border-ink-3 bg-mist", pos)}
        />
      ))}
      {children}
    </div>
  );
}

/** A figure on the bib: a big condensed value over a small caption. */
export function BibFigure({ value, caption, className }: { value: ReactNode; caption: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <span className="font-bib text-6xl leading-[0.85] sm:text-7xl">{value}</span>
      <span className="mt-1 text-sm font-medium text-ink-2">{caption}</span>
    </div>
  );
}

/** "2nd" with a raised, smaller suffix. */
export function Ordinal({ n, className }: { n: number; className?: string }) {
  const [num, suffix] = ordinalParts(n);
  return (
    <span className={cn("font-bib", className)}>
      {num}
      <span className="ml-[0.04em] align-[0.42em] text-[0.42em] font-bold">{suffix}</span>
    </span>
  );
}

/** Inline condensed number (tabular), e.g. points in lists. */
export function Numeral({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-bib tabular-nums", className)}>{children}</span>;
}
