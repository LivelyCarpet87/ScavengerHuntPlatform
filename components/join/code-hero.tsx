import type { ReactNode } from "react";
import { ContourArt } from "@/components/ui/contour-art";
import { Mascot } from "@/components/ui/mascot";
import { cn } from "@/lib/utils";
import { CodeEntry } from "./code-entry";

/**
 * The front door: the hunt code entry on a paper plate over contour terrain,
 * with the hedgehog peering over the edge. Used by the landing page and by
 * /join/[code] when a code doesn't match a hunt.
 */
export function CodeHero({
  title = "Enter the hunt code",
  lead = "Six digits, printed on the hunt poster or sent by your organizer.",
  defaultCode,
  error,
  autoFocus,
  footer,
  className,
}: {
  title?: string;
  lead?: ReactNode;
  defaultCode?: string;
  error?: string;
  autoFocus?: boolean;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("relative overflow-hidden border-b border-line", className)}>
      <ContourArt seed="scavenger:front-door" />
      <div className="relative mx-auto max-w-xl px-4 pt-20 pb-10 sm:pt-28 sm:pb-16">
        <div className="relative rounded-xl border border-line bg-paper px-4 pt-8 pb-5 text-center sm:px-8 sm:pt-10 sm:pb-8">
          <Mascot size={96} className="absolute -top-[4.25rem] right-2 size-24 sm:-top-20 sm:right-6 sm:size-28" />
          <h1 className="font-cond text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mx-auto mt-2 max-w-sm text-ink-2">{lead}</p>
          <CodeEntry className="mt-6 sm:mt-8" defaultCode={defaultCode} initialError={error} autoFocus={autoFocus} />
          {footer ? <div className="mt-5 border-t border-line pt-4 text-sm text-ink-2">{footer}</div> : null}
        </div>
      </div>
    </section>
  );
}
