import { cn } from "@/lib/utils";

/** A placeholder block for loading screens. Static: no shimmer, just the shape of what's coming. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded-md bg-mist", className)} />;
}

/** Rows of a list (marker, two lines of text, a figure on the right). */
export function SkeletonRows({ rows = 5, marker = "circle" }: { rows?: number; marker?: "circle" | "none" }) {
  return (
    <ul aria-hidden className="divide-y divide-line border-y border-line">
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <li key={i} className="flex min-h-[4.5rem] items-center gap-3.5 py-3">
          {marker === "circle" ? <Skeleton className="size-12 shrink-0 rounded-full" /> : null}
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className={cn("h-4", i % 2 ? "w-2/5" : "w-3/5")} />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-7 w-12" />
        </li>
      ))}
    </ul>
  );
}
