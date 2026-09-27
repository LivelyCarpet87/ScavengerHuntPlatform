import { cn } from "@/lib/utils";

/** The hedgehog with the magnifying glass — the platform's mascot. */
export function Mascot({ size = 64, className }: { size?: number; className?: string }) {
  return (
    // biome-ignore lint/performance/noImgElement: tiny static brand image, no optimization needed
    <img
      src={size > 192 ? "/brand/hedgehog-512.png" : "/brand/hedgehog-192.png"}
      width={size}
      height={size}
      alt=""
      aria-hidden
      className={cn("shrink-0 select-none", className)}
      draggable={false}
    />
  );
}
