import { coursePoints } from "@/lib/staff/course";

/**
 * The course drawn over a hunt's terrain: a start triangle and one control
 * circle per task, scattered Score-O style (no order, no connecting lines).
 * Circles use the accent, so they follow the hunt's color inside data-accent.
 * A paper halo keeps them legible over dense contours. Absolutely fills its
 * (relative) parent; positions are percentages so any box works.
 *
 * No server-only imports: usable in client previews too.
 */
export function CourseOverprint({
  seed,
  controls,
  codes,
  aspect = 3,
  ringSize = 9,
}: {
  seed: string;
  controls: number;
  /** Optional control codes printed beside the circles, like a real map. */
  codes?: number[];
  aspect?: number;
  ringSize?: number;
}) {
  const { start, controls: points } = coursePoints(seed, codes?.length ?? controls, aspect);
  const tri = ringSize * 1.25;
  // Thin rings on small thumbnails, map-weight rings on big sheets.
  const stroke = Math.min(2.25, Math.max(1.25, ringSize / 4));
  const halo = stroke + 3.5;
  const triangle = `M0 ${-tri} L${tri * 0.866} ${tri * 0.5} L${-tri * 0.866} ${tri * 0.5} Z`;
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
      <svg x={`${start.x}%`} y={`${start.y}%`} overflow="visible">
        <path d={triangle} fill="none" stroke="var(--paper)" strokeWidth={halo} strokeLinejoin="round" opacity={0.85} />
        <path d={triangle} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinejoin="round" />
      </svg>
      {points.map((p, i) => (
        <g key={`${p.x}-${p.y}`}>
          <circle
            cx={`${p.x}%`}
            cy={`${p.y}%`}
            r={ringSize}
            fill="none"
            stroke="var(--paper)"
            strokeWidth={halo}
            opacity={0.85}
          />
          <circle cx={`${p.x}%`} cy={`${p.y}%`} r={ringSize} fill="none" stroke="var(--accent)" strokeWidth={stroke} />
          {codes?.[i] != null ? (
            <text
              x={`${p.x}%`}
              y={`${p.y}%`}
              dx={ringSize + 2}
              dy={-ringSize + 2}
              fill="var(--accent)"
              stroke="var(--paper)"
              strokeWidth={3}
              paintOrder="stroke"
              style={{ fontStretch: "62%", fontWeight: 800, fontSize: 12 }}
            >
              {codes[i]}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}
