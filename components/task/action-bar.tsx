import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The task page's primary action. On phones it is pinned above the tab bar so
 * the camera button is always under the thumb; from `md` it sits in the flow
 * under the form. The page adds <ActionBarSpacer /> so nothing hides behind it.
 */
export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
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
  return <div aria-hidden className="h-24 md:hidden" />;
}
