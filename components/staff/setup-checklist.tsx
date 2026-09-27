import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { SetupStep } from "@/lib/staff/checklist";
import { cn } from "@/lib/utils";

/**
 * The draft/upcoming checklist. Shape carries the state (ring = to do, solid
 * disc with a tick = done), words back it up, and each step links to where
 * it gets done. Steps still to do get a real button; done steps shrink to a
 * quiet link beside their title, so the list stays short on a phone.
 * `publishSlot` renders the publish button in place.
 */
export function SetupChecklist({ steps, publishSlot }: { steps: SetupStep[]; publishSlot?: ReactNode }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <section aria-labelledby="setup-heading" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="setup-heading" className="font-cond text-2xl font-bold">
          Get ready
        </h2>
        <p className="text-sm text-ink-2">
          <span className="font-bib text-lg text-ink">{done}</span> of {steps.length} done
        </p>
      </div>
      <ol className="divide-y divide-line rounded-lg border border-line">
        {steps.map((step) => (
          <li
            key={step.id}
            id={step.id === "publish" ? "publish" : undefined}
            className={cn(
              "flex items-start gap-x-4 px-4",
              step.done ? "py-3.5" : "flex-wrap gap-y-3 py-4 sm:flex-nowrap sm:items-center",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full",
                step.done ? "bg-accent text-accent-ink" : "border-[2.5px] border-accent",
              )}
            >
              {step.done ? <Check className="size-4" strokeWidth={3} /> : null}
            </span>
            <div className="min-w-0 flex-1 basis-48">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <p className={cn("font-semibold", step.done && "text-ink-2")}>
                  {step.title}
                  <span className="sr-only">{step.done ? " (done)" : " (to do)"}</span>
                </p>
                {step.done ? (
                  <Link
                    href={step.href}
                    className="-my-3 inline-flex items-center py-3 text-sm font-semibold text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
                  >
                    {step.cta}
                  </Link>
                ) : null}
              </div>
              <p className="text-sm text-ink-2">{step.detail}</p>
            </div>
            {step.done ? null : (
              <div className="w-full pl-12 sm:w-auto sm:shrink-0 sm:pl-0">
                {step.id === "publish" && publishSlot ? (
                  publishSlot
                ) : (
                  <Link
                    href={step.href}
                    className="inline-flex h-10 items-center rounded-md bg-paper px-3 text-sm font-semibold text-ink shadow-[inset_0_0_0_2px_var(--ink)] transition-colors hover:bg-mist"
                  >
                    {step.cta}
                  </Link>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
