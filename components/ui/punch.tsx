import { punchPattern } from "@/lib/punch";
import { cn } from "@/lib/utils";
import type { ControlState } from "./control";

/*
 * The control card: one box per task, like the paper card an orienteer
 * punches at each control. A completed task shows its unique pin-punch
 * pattern; pending boxes are dashed on yellow; rejected ones are slashed.
 */

type PunchMarkProps = {
  seed: string;
  size?: number;
  className?: string;
  /** Animate holes in (use once, when a result arrives). */
  animate?: boolean;
};

/** A task's unique pin-punch pattern. */
export function PunchMark({ seed, size = 40, className, animate }: PunchMarkProps) {
  const holes = punchPattern(seed);
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden className={cn("shrink-0", className)}>
      {holes.map(([c, r], i) => (
        <circle
          key={`${c}-${r}`}
          cx={8 + c * 8}
          cy={8 + r * 8}
          r={3}
          fill="currentColor"
          className={animate ? "animate-punch" : undefined}
          style={
            animate ? { animationDelay: `${i * 45}ms`, transformOrigin: `${8 + c * 8}px ${8 + r * 8}px` } : undefined
          }
        />
      ))}
    </svg>
  );
}

export type CardCell = {
  id: string;
  code: number | string;
  title: string;
  state: ControlState;
  href?: string;
  /** Animate the punch (e.g. just approved). */
  fresh?: boolean;
};

const stateLabel: Record<ControlState, string> = {
  todo: "not done yet",
  pending: "waiting for review",
  approved: "done",
  rejected: "rejected — try again",
  locked: "locked",
};

/** The team's control card — a grid of boxes, one per task. */
export function ControlCard({ cells, className }: { cells: CardCell[]; className?: string }) {
  return (
    <ol
      className={cn("grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1.5", className)}
      aria-label="Control card"
    >
      {cells.map((cell) => {
        const inner = (
          <>
            <span
              className={cn(
                "absolute top-1 left-1.5 font-bib text-xs leading-none",
                cell.state === "approved" ? "text-accent" : "text-ink-2",
              )}
            >
              {cell.code}
            </span>
            {cell.state === "approved" ? (
              <PunchMark seed={cell.id} size={30} className="text-accent" animate={cell.fresh} />
            ) : null}
            {cell.state === "rejected" ? (
              <svg viewBox="0 0 40 40" className="absolute inset-0 size-full text-danger" aria-hidden>
                <line x1="6" y1="34" x2="34" y2="6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            ) : null}
            <span className="sr-only">
              {cell.title}: {stateLabel[cell.state]}
            </span>
          </>
        );
        const box = cn(
          "relative grid aspect-square place-items-center rounded-sm border-2 transition-colors",
          cell.state === "approved" && "border-accent bg-accent-wash",
          cell.state === "pending" && "border-dashed border-sun-fg/70 bg-sun-wash",
          cell.state === "rejected" && "border-danger/60 bg-paper",
          cell.state === "todo" && "border-line-strong bg-paper",
          cell.state === "locked" && "border-dotted border-line-strong bg-mist",
          cell.href && "hover:border-ink",
        );
        return (
          <li key={cell.id}>
            {cell.href ? (
              <a href={cell.href} className={box} title={cell.title}>
                {inner}
              </a>
            ) : (
              <div className={box} title={cell.title}>
                {inner}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
