import { cn } from "@/lib/utils";

/** A placeholder block for loading.tsx screens in the judging area. */
export function Bone({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-mist", className)} />;
}

/** Announces the loading state once for screen readers. */
export function LoadingLabel({ children }: { children: string }) {
  return <output className="sr-only">{children}</output>;
}
