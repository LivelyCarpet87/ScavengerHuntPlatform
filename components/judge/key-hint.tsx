import { Kbd } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/**
 * A keyboard shortcut hint shown next to a control. Hidden from assistive
 * tech (the control carries aria-keyshortcuts instead), so "Reject" isn't
 * announced as "Reject R".
 */
export function KeyHint({ k, className, kbdClassName }: { k: string; className?: string; kbdClassName?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex", className)}>
      <Kbd className={kbdClassName}>{k}</Kbd>
    </span>
  );
}
