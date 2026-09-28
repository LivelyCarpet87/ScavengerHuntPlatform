"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The task page's primary action. On phones it is pinned above the tab bar so
 * the camera button, the answer field or the code field is always under the
 * thumb; from `md` it sits in the flow under the form. The page adds
 * <ActionBarSpacer /> so nothing hides behind it.
 *
 * While mounted it keeps --action-bar-h on <html> at its current height (it
 * grows when it shows a message), for the spacer and for anything else that
 * has to clear it.
 */
export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--action-bar-h", `${bar.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--action-bar-h");
    };
  }, []);

  return (
    <div
      ref={ref}
      data-action-bar
      className={cn(
        "fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-paper/95 backdrop-blur",
        "md:static md:z-auto md:mt-5 md:border-0 md:bg-transparent md:backdrop-blur-none",
        className,
      )}
    >
      <div className="mx-auto max-w-3xl px-4 py-3 md:px-0 md:py-0">{children}</div>
    </div>
  );
}

/** Room at the end of the page for the pinned action bar on phones. */
export function ActionBarSpacer() {
  return <div aria-hidden className="h-[var(--action-bar-h,6rem)] md:hidden" />;
}
