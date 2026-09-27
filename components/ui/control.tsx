import { cn } from "@/lib/utils";

/*
 * Course symbols from orienteering maps, drawn in the overprint color:
 *   ▲ start (triangle)   ○ control (circle, with its code)   ◎ finish (double circle)
 *
 * A task's state is encoded by shape as well as color, so it reads for
 * color-blind players and in direct sunlight:
 *   todo      ring
 *   pending   dashed ring on yellow — waiting for a judge
 *   approved  solid disc — punched
 *   rejected  ring with a slash — try again
 *   locked    dotted grey ring
 */

export type ControlState = "todo" | "pending" | "approved" | "rejected" | "locked";

const SIZES = { sm: 36, md: 48, lg: 72, xl: 112 } as const;

type ControlMarkerProps = {
  code: number | string;
  state?: ControlState;
  size?: keyof typeof SIZES;
  className?: string;
  /** Accessible label; defaults to "Control {code}". */
  label?: string;
};

export function ControlMarker({ code, state = "todo", size = "md", className, label }: ControlMarkerProps) {
  const px = SIZES[size];
  const stroke = size === "sm" ? 2.5 : size === "md" ? 3 : size === "lg" ? 4 : 5;
  const r = 50 - (stroke * 100) / px / 2 - 1;
  const sw = (stroke * 100) / px;
  const text = String(code);
  const fontSize = text.length > 2 ? 34 : 42;

  const ring = state === "locked" ? "var(--ink-3)" : state === "rejected" ? "var(--danger)" : "var(--accent)";
  const fill = state === "approved" ? "var(--accent)" : state === "pending" ? "var(--sun)" : "var(--paper)";
  const textColor =
    state === "approved"
      ? "var(--accent-ink)"
      : state === "pending"
        ? "var(--sun-ink)"
        : state === "locked"
          ? "var(--ink-3)"
          : state === "rejected"
            ? "var(--danger)"
            : "var(--accent)";

  return (
    <svg
      viewBox="0 0 100 100"
      width={px}
      height={px}
      role="img"
      aria-label={label ?? `Control ${code}`}
      className={cn("shrink-0 overflow-visible", className)}
    >
      <circle
        cx="50"
        cy="50"
        r={r}
        fill={fill}
        stroke={ring}
        strokeWidth={sw}
        strokeDasharray={state === "pending" ? "10 7" : state === "locked" ? "2 8" : undefined}
        strokeLinecap={state === "locked" ? "round" : undefined}
      />
      <text
        x="50"
        y="50"
        dy="0.35em"
        textAnchor="middle"
        fill={textColor}
        style={{ fontStretch: "62%", fontWeight: 800, fontSize }}
      >
        {text}
      </text>
      {state === "rejected" ? (
        <line x1="18" y1="82" x2="82" y2="18" stroke="var(--danger)" strokeWidth={sw} strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

/** Start triangle — marks where/when the hunt begins. */
export function StartMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className={cn("shrink-0", className)}>
      <path d="M50 10 L92 84 L8 84 Z" fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinejoin="round" />
    </svg>
  );
}

/** Finish double circle — marks where/when the hunt ends. */
export function FinishMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className={cn("shrink-0", className)}>
      <circle cx="50" cy="50" r="42" fill="none" stroke="var(--accent)" strokeWidth="8" />
      <circle cx="50" cy="50" r="26" fill="none" stroke="var(--accent)" strokeWidth="8" />
    </svg>
  );
}

/** The brand mark: start triangle inside a control circle. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className={cn("shrink-0", className)}>
      <circle cx="50" cy="50" r="43" fill="none" stroke="var(--overprint)" strokeWidth="9" />
      <path d="M50 26 L72 66 L28 66 Z" fill="var(--overprint)" />
    </svg>
  );
}
