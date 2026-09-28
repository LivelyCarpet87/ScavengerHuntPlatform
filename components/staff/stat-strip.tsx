import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Figures at a glance as one strip divided by hairlines, like a results
 * board, instead of a grid of identical tiles. Cells grow to fill each row,
 * so any number of them wraps cleanly on a phone.
 */

export function StatStrip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <ul
      aria-label={label}
      className={cn("flex flex-wrap gap-px overflow-hidden rounded-lg border border-line bg-line", className)}
    >
      {children}
    </ul>
  );
}

/**
 * One figure and its caption. With `href` the whole cell is a link, and
 * `highlight` marks the one cell that asks for attention (e.g. "To review").
 */
export function StatCell({
  value,
  caption,
  href,
  highlight = false,
}: {
  value: ReactNode;
  caption: ReactNode;
  href?: string;
  highlight?: boolean;
}) {
  const body = (
    <>
      <span className="font-bib text-4xl leading-none">{value}</span>
      <span
        className={cn(
          "mt-1.5 flex flex-wrap items-center gap-x-1.5 text-sm text-ink-2",
          highlight && "font-semibold text-sun-fg",
        )}
      >
        {caption}
      </span>
    </>
  );
  const surface = cn("flex flex-1 flex-col px-4 py-3", highlight ? "bg-sun-wash" : "bg-paper");
  return (
    <li className="flex min-w-[7.5rem] flex-1">
      {href ? (
        <Link
          href={href}
          className={cn(surface, "transition-colors", highlight ? "hover:brightness-95" : "hover:bg-mist")}
        >
          {body}
        </Link>
      ) : (
        <div className={surface}>{body}</div>
      )}
    </li>
  );
}
