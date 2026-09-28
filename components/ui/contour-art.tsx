import { cn } from "@/lib/utils";

/** Bump when the terrain algorithm in lib/contours.ts changes, so browsers fetch the new art. */
const TERRAIN_VERSION = "2";

/**
 * A hunt's generated terrain: topographic contour lines seeded by the hunt id.
 * Decorative — absolutely fills the parent (which should be `relative`).
 *
 * The lines come from /terrain/[seed] (an SVG cached forever) used as a CSS
 * mask over the theme's contour color, so a page carries a URL instead of the
 * path data, the art is cached across pages, and it still follows Day and
 * Night-O. Tint it with a text-* class.
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
  const url = `url("/terrain/${encodeURIComponent(seed)}?v=${TERRAIN_VERSION}")`;
  const opacity = strength === "faint" ? 0.22 : strength === "bold" ? 0.7 : 0.45;
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 block size-full bg-current text-contour", className)}
      style={{
        opacity,
        maskImage: url,
        WebkitMaskImage: url,
        maskSize: "cover",
        WebkitMaskSize: "cover",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        // Printed posters keep their terrain even with "background graphics" off.
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    />
  );
}
