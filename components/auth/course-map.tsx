import type { ReactNode } from "react";
import { ContourArt } from "@/components/ui/contour-art";
import { ControlMarker, type ControlState, FinishMark, StartMark } from "@/components/ui/control";
import { cn } from "@/lib/utils";

/*
 * A small Score-O course printed on generated terrain: a start triangle, a
 * handful of controls in different states and the finish. Decorative art for
 * the staff entrance pages (sign in, setup, invites). Controls are scattered
 * with no connecting lines — in a Score-O teams choose their own order.
 */

type Placed = { x: number; y: number };

const START: Placed = { x: 16, y: 20 };
const FINISH: Placed = { x: 26, y: 29 };
const CONTROLS: (Placed & { code: number; state: ControlState })[] = [
  { x: 44, y: 14, code: 31, state: "approved" },
  { x: 76, y: 20, code: 47, state: "todo" },
  { x: 60, y: 38, code: 52, state: "pending" },
  { x: 30, y: 50, code: 38, state: "todo" },
  { x: 86, y: 46, code: 64, state: "todo" },
  { x: 12, y: 64, code: 55, state: "approved" },
];

function At({ at, children }: { at: Placed; children: ReactNode }) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${at.x}%`, top: `${at.y}%` }}>
      {children}
    </div>
  );
}

export function CourseMap({
  seed,
  className,
  children,
}: {
  seed: string;
  className?: string;
  /** Content for the paper plate at the bottom of the map. */
  children?: ReactNode;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-line bg-paper", className)}>
      <ContourArt seed={seed} />
      <div aria-hidden className="absolute inset-0">
        <At at={START}>
          <StartMark size={44} />
        </At>
        <At at={FINISH}>
          <FinishMark size={40} />
        </At>
        {CONTROLS.map((c) => (
          <At key={c.code} at={c}>
            <ControlMarker code={c.code} state={c.state} size="md" label="" />
          </At>
        ))}
      </div>
      {children ? (
        <div className="absolute inset-x-5 bottom-5 rounded-lg border border-line bg-paper p-5">{children}</div>
      ) : null}
    </div>
  );
}
