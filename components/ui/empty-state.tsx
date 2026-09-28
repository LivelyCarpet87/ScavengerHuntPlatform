import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Mascot } from "./mascot";

/**
 * Empty and "nothing yet" screens. Say what will appear here and how to make
 * it happen; include the action when there is one.
 */
export function EmptyState({
  title,
  children,
  action,
  mascot = true,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  mascot?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      {mascot ? <Mascot size={88} className="mb-4" /> : null}
      <h2 className="font-cond text-2xl font-bold">{title}</h2>
      {children ? <div className="mt-2 max-w-sm text-ink-2">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
