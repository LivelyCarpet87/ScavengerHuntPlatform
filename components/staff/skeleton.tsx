import { cn } from "@/lib/utils";

/** A placeholder block for loading.tsx skeletons. Shapes should match the final layout. */
export function Bone({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded-md bg-mist", className)} />;
}

/** Screen-reader announcement for a loading skeleton. */
export function LoadingLabel({ children }: { children: string }) {
  return <output className="sr-only">{children}</output>;
}
