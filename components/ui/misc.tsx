import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Keyboard shortcut hint, e.g. <Kbd>A</Kbd>. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-grid h-5 min-w-5 place-items-center rounded-xs border border-line-strong border-b-2 bg-paper px-1 font-sans text-[0.7rem] font-semibold text-ink-2",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Pulsing dot for live data. */
export function LiveDot({ className, label = "Live" }: { className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold text-danger", className)}>
      <span aria-hidden className="size-2 rounded-full bg-danger animate-live" />
      {label}
    </span>
  );
}

/**
 * A grouped surface. Use for forms and sections that belong together — not as
 * a default wrapper for every piece of content.
 */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  ...props
}: Omit<ComponentProps<"section">, "title"> & { title?: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-lg border border-line bg-paper", className)} {...props}>
      {title || actions ? (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            {title ? <h2 className="font-cond text-xl font-bold">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-ink-2">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Page title block used at the top of screens. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="font-cond text-4xl font-extrabold tracking-tight">{title}</h1>
        {description ? <p className="mt-1.5 max-w-prose text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Inline notice: info (water), warning (sun), danger, success (forest). */
export function Notice({
  tone = "info",
  title,
  children,
  className,
  icon,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg px-4 py-3",
        tone === "info" && "bg-water-wash",
        tone === "warning" && "bg-sun-wash",
        tone === "danger" && "bg-danger-wash",
        tone === "success" && "bg-forest-wash",
        className,
      )}
    >
      {icon ? (
        <span
          className={cn(
            "mt-0.5 shrink-0",
            tone === "info" && "text-water",
            tone === "warning" && "text-sun-ink dark:text-sun",
            tone === "danger" && "text-danger",
            tone === "success" && "text-forest",
          )}
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 text-sm">
        {title ? <p className="font-semibold text-ink">{title}</p> : null}
        {children ? <div className={cn("text-ink-2", title && "mt-0.5")}>{children}</div> : null}
      </div>
    </div>
  );
}
