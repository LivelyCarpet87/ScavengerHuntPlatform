import { ContourArt } from "@/components/ui/contour-art";
import { cn } from "@/lib/utils";
import { CourseOverprint } from "./course-overprint";

/**
 * A hunt as a Score-O map: its generated terrain (seeded by the hunt id) with
 * the course overprinted on top. Used on dashboard cards and the overview.
 * Decorative; give the container a height.
 */
export function HuntMap({
  seed,
  controls,
  codes,
  aspect = 3,
  strength = "normal",
  className,
  ringSize = 9,
}: {
  seed: string;
  /** Number of control circles to draw (tasks in the hunt). */
  controls: number;
  /** Optional control codes printed beside the circles. */
  codes?: number[];
  /** Width / height of the box, for even spacing. */
  aspect?: number;
  strength?: "faint" | "normal" | "bold";
  className?: string;
  ringSize?: number;
}) {
  return (
    <div aria-hidden className={cn("relative overflow-hidden bg-paper", className)}>
      <ContourArt seed={seed} strength={strength} />
      <CourseOverprint seed={seed} controls={controls} codes={codes} aspect={aspect} ringSize={ringSize} />
    </div>
  );
}
