"use client";

import { formatPoints } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Live preview of a task's scoring: one bar per solve (or contest place),
 * drawn in the hunt's accent from a single baseline. Short charts label every
 * bar (long ones just the ends), the sentence underneath says it in words,
 * hovering a bar shows its value, and "Show every value" opens the table.
 */
export function ScoringPreview({
  title,
  values,
  labels,
  summary,
  columnLabel,
}: {
  title: string;
  values: number[];
  /** Label for each bar, e.g. "3rd solve" or "2 teams". */
  labels: string[];
  /** The whole curve in one sentence (the accessible version of the chart). */
  summary: string;
  columnLabel: string;
}) {
  const max = Math.max(1, ...values);
  // Few bars: label each one and draw them wider. Many: label the ends only.
  const few = values.length <= 8;
  return (
    <figure className="rounded-lg bg-mist p-4">
      <figcaption className="text-sm font-semibold">{title}</figcaption>
      <div aria-hidden className="mt-3 flex h-36 items-end gap-0.5 border-b border-line-strong pt-6">
        {values.map((v, i) => {
          const pct = Math.max(1.5, (Math.max(0, v) / max) * 100);
          const labelled = few || i === 0 || i === values.length - 1;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: bars are positions on a fixed axis
            <div key={i} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              {labelled ? (
                <span
                  className="absolute font-bib text-sm leading-none text-ink"
                  style={{ bottom: `calc(${pct}% + 4px)` }}
                >
                  {formatPoints(v)}
                </span>
              ) : null}
              <div
                className={cn(
                  "w-full rounded-t-[4px] bg-accent transition-[height] duration-150 group-hover:brightness-110",
                  values.length <= 6 ? "max-w-10" : "max-w-6",
                )}
                style={{ height: `${pct}%` }}
              />
              <span
                className="pointer-events-none absolute z-10 hidden -translate-y-2 rounded-md bg-ink px-2 py-1 text-xs font-semibold whitespace-nowrap text-paper shadow-pop group-hover:block"
                style={{ bottom: `${pct}%` }}
              >
                {labels[i]}: {formatPoints(v)}
              </span>
            </div>
          );
        })}
      </div>
      <div aria-hidden className="mt-1.5 flex justify-between gap-2 text-xs text-ink-2">
        <span>{labels[0]}</span>
        {values.length > 1 ? <span>{labels[labels.length - 1]}</span> : null}
      </div>
      <p className="mt-3 text-sm text-ink">{summary}</p>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer py-1 font-semibold text-ink-2 hover:text-ink">Show every value</summary>
        <table className="mt-1 w-full max-w-xs">
          <thead>
            <tr className="border-b border-line text-left text-ink-2">
              <th scope="col" className="py-1 font-medium">
                {columnLabel}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Points
              </th>
            </tr>
          </thead>
          <tbody>
            {values.map((v, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positions on a fixed axis
              <tr key={i} className="border-b border-line last:border-0">
                <td className="py-1">{labels[i]}</td>
                <td className="py-1 text-right font-bib tabular-nums">{formatPoints(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
