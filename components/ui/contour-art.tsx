import { contourMap } from "@/lib/contours";
import { cn } from "@/lib/utils";

/**
 * A hunt's generated terrain: topographic contour lines seeded by the hunt id.
 * Decorative — absolutely fill the parent (which should be `relative`).
 * Server component: the SVG is computed once and cached.
 */
export function ContourArt({
  seed,
  className,
  strength = "normal",
}: {
  seed: string;
  className?: string;
  /** "faint" for behind text, "normal" for headers, "bold" for empty/hero areas. */
  strength?: "faint" | "normal" | "bold";
}) {
  const map = contourMap(seed);
  const opacity = strength === "faint" ? 0.22 : strength === "bold" ? 0.7 : 0.45;
  return (
    <svg
      aria-hidden
      viewBox={map.viewBox}
      preserveAspectRatio="xMidYMid slice"
      className={cn("pointer-events-none absolute inset-0 size-full text-contour", className)}
      style={{ opacity }}
    >
      {map.paths.map((p, i) => (
        <path
          // biome-ignore lint/suspicious/noArrayIndexKey: static generated art
          key={i}
          d={p.d}
          fill="none"
          stroke="currentColor"
          strokeWidth={p.index ? 1.6 : 0.8}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
