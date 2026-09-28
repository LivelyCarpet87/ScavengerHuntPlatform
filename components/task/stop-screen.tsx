import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A single-purpose screen that says why the player can't go on here and where
 * to go instead: a course symbol, a big headline (the page's h1), what
 * happened, and the way back. Checkpoint posters, tasks that aren't open and
 * a hunt that hasn't started all use it, so they read as one family. (Empty
 * and waiting-for-something states keep the mascot: see EmptyState.)
 *
 *   <StopScreen mark={<ControlMarker code="?" state="locked" size="xl" />} title="This task isn’t open"
 *     actions={<ButtonLink href={…} size="lg">Back to tasks</ButtonLink>}>…</StopScreen>
 */
export function StopScreen({
  mark,
  title,
  children,
  actions,
  className,
}: {
  /** A ControlMarker, StartMark … — the course symbol for the situation. */
  mark: ReactNode;
  title: string;
  /** What happened, in a sentence or two. */
  children?: ReactNode;
  /** The way on, primary first. */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex max-w-sm flex-col items-center text-center", className)}>
      {mark}
      <h1 className="mt-8 font-cond text-4xl font-extrabold tracking-tight text-balance">{title}</h1>
      {children ? <div className="mt-3 flex flex-col items-center text-lg text-ink-2">{children}</div> : null}
      {actions ? <div className="mt-8 flex w-full max-w-xs flex-col gap-2">{actions}</div> : null}
    </div>
  );
}

/** Centers a StopScreen (or a punch result) in the space between the header and the tab bar. */
export function StopScreenFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-13rem)] flex-col items-center justify-center py-8 text-center">
      {children}
    </div>
  );
}
