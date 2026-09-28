import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One A4 page. On screen it's a paper preview that scales with the available
 * width (content is sized in container units, cqw, so a phone shows the same
 * layout smaller); on paper it's exactly 210 × 297 mm with a page break after.
 */
export function Sheet({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section
      aria-label={label}
      className={cn(
        "@container relative mx-auto aspect-[210/297] w-full max-w-[210mm] overflow-hidden bg-paper text-ink ring-1 ring-line",
        "print:m-0 print:h-[296mm] print:w-[210mm] print:max-w-none print:ring-0 print:not-last:break-after-page",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Stack of sheets with a gap on screen and none on paper. */
export function SheetStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-8 print:block print:gap-0">{children}</div>;
}
