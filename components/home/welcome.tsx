"use client";

import { X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

/**
 * Shown right after starting or joining a team (?welcome=1): "Get your team
 * on board" with the invite for whoever started the team, a short "You're
 * in" for everyone joining it. Closing it drops the flag from the URL
 * without a reload.
 */
export function WelcomeBlock({
  title,
  lead,
  closeLabel,
  children,
}: {
  title: string;
  lead: ReactNode;
  /** What closing hides, e.g. "Hide the invite". */
  closeLabel: string;
  children?: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLElement>(null);

  // Arriving from a form further down the page can leave this block under the
  // sticky header; bring it fully into view once.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.getBoundingClientRect().top < 64) el.scrollIntoView({ block: "start" });
  }, []);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("welcome");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <section ref={ref} aria-labelledby="welcome-title" className="flex scroll-mt-20 flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="welcome-title" className="font-cond text-3xl font-extrabold tracking-tight break-words sm:text-4xl">
            {title}
          </h2>
          <p className="mt-1 max-w-prose text-ink-2">{lead}</p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={closeLabel}
          className="-mt-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-md text-ink-2 hover:bg-mist hover:text-ink"
        >
          <X className="size-5" />
        </button>
      </div>
      {children}
    </section>
  );
}
