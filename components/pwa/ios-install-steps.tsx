import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The iOS share glyph (a box with an arrow leaving it), as it appears in Safari's toolbar. */
export function ShareGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("inline-block size-[1.15em] shrink-0 align-[-0.2em] text-water", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.6 9.6H7.2a2.2 2.2 0 0 0-2.2 2.2v7a2.2 2.2 0 0 0 2.2 2.2h9.6a2.2 2.2 0 0 0 2.2-2.2v-7a2.2 2.2 0 0 0-2.2-2.2h-1.4" />
      <path d="M12 14.2V3.2" />
      <path d="M8.4 6.6 12 3l3.6 3.6" />
    </svg>
  );
}

/** Safari's "•••" button, which holds Share in the compact tab bar of newer iPhones. */
export function MoreGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("inline-block size-[1.15em] shrink-0 align-[-0.2em]", className)}
      fill="currentColor"
    >
      <circle cx="5.5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="18.5" cy="12" r="1.9" />
    </svg>
  );
}

/** The "Add to Home Screen" glyph: a plus in a rounded square. */
export function AddGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("inline-block size-[1.15em] shrink-0 align-[-0.2em]", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
    >
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className="mt-px grid size-6 shrink-0 place-items-center rounded-full bg-mist-2 text-xs font-bold text-ink-2"
      >
        {n}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** How to add the app to the Home Screen on iPhone and iPad (Safari and other iOS browsers). */
export function IosInstallSteps({ finalStep, className }: { finalStep?: ReactNode; className?: string }) {
  return (
    <ol className={cn("flex flex-col gap-2.5 text-sm text-ink", className)}>
      <Step n={1}>
        Tap <span className="font-semibold">Share</span> <ShareGlyph /> in the browser's toolbar. On newer iPhones it's
        inside the <span className="sr-only">More</span>
        <MoreGlyph /> menu.
      </Step>
      <Step n={2}>
        Scroll down and tap <span className="font-semibold">Add to Home Screen</span> <AddGlyph />.
      </Step>
      {finalStep ? <Step n={3}>{finalStep}</Step> : null}
    </ol>
  );
}
