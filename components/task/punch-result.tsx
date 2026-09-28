import type { ReactNode } from "react";
import { ControlMarker } from "@/components/ui/control";
import { PunchMark } from "@/components/ui/punch";
import { formatSigned } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A punched control, at rest: the filled control circle beside its box on
 * the control card with the task's pin-punch pattern. The animated version
 * is PunchCelebration (components/live), which plays once over the page and
 * then fades to reveal this.
 */
export function PunchResult({
  code,
  seed,
  headline,
  points,
  title,
  note,
  children,
  className,
}: {
  code: number;
  /** The task id — each task has its own punch pattern. */
  seed: string;
  /** "Punched!", "Already punched at 19:42" … */
  headline: string;
  points?: number | null;
  title: string;
  /** A line under the title, e.g. when it was punched. */
  note?: ReactNode;
  /** Actions, e.g. "Back to tasks". */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <div aria-hidden className="flex items-center gap-5">
        <ControlMarker code={code} state="approved" size="xl" />
        <span className="relative grid size-28 place-items-center rounded-md border-[3px] border-accent bg-accent-wash text-accent">
          <span className="absolute top-1.5 left-2 font-bib text-base leading-none">{code}</span>
          <PunchMark seed={seed} size={84} />
        </span>
      </div>
      <h1
        className={cn(
          "mt-8 font-cond font-extrabold tracking-tight text-balance",
          headline.length > 16 ? "text-4xl" : "text-5xl",
        )}
      >
        {headline}
      </h1>
      {points != null && points !== 0 ? (
        <p className="mt-2 flex items-baseline gap-2">
          <span className="font-bib text-7xl leading-none text-accent">{formatSigned(points)}</span>
          <span className="text-lg font-semibold text-ink-2">points</span>
        </p>
      ) : null}
      <p className="mt-3 max-w-xs text-lg font-semibold text-balance">{title}</p>
      {note ? <p className="mt-1 text-ink-2">{note}</p> : null}
      {children ? <div className="mt-8 flex w-full max-w-xs flex-col gap-2">{children}</div> : null}
    </div>
  );
}
