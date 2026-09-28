"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { recordPrintAction } from "@/lib/staff/hunt-actions";

/**
 * Print pages always render in Day colors: Night-O tokens would print light
 * ink on white paper. Restores the previous theme when leaving the page.
 */
export function PrintTheme() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "light");
    return () => {
      if (previous == null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", previous);
    };
  }, []);
  return null;
}

/**
 * The on-screen bar above a print preview: back link, what's being printed,
 * printing tips and the Print button. Hidden on paper. Printing (with the
 * button or Ctrl/Cmd+P) is recorded so the setup checklist can tick it off;
 * checkpoint posters also record which checkpoints were on the pages.
 */
export function PrintToolbar({
  huntId,
  what,
  taskIds,
  title,
  summary,
  backHref,
  backLabel,
  tip = "Print on A4 at 100% scale (“Actual size”).",
  children,
}: {
  huntId: string;
  what: "checkpoints" | "poster" | "team_cards";
  /** Checkpoint posters: the tasks whose posters are on the page. */
  taskIds?: string[];
  title: string;
  summary: string;
  backHref: string;
  backLabel: string;
  /** Printer settings that matter for this page. */
  tip?: string;
  /** Extra controls, e.g. "print all" links. */
  children?: ReactNode;
}) {
  // A stable key, so a re-render with the same tasks doesn't re-arm the recorder.
  const tasksKey = taskIds?.join(",") ?? "";
  useEffect(() => {
    let recorded = false;
    const onBeforePrint = () => {
      if (recorded) return;
      recorded = true;
      const ids = tasksKey ? tasksKey.split(",") : undefined;
      recordPrintAction({ huntId, what, taskIds: ids }).catch(() => {
        recorded = false;
      });
    };
    window.addEventListener("beforeprint", onBeforePrint);
    return () => window.removeEventListener("beforeprint", onBeforePrint);
  }, [huntId, what, tasksKey]);

  return (
    <div className="mb-6 flex flex-col gap-4 print:hidden">
      <Link
        href={backHref}
        className="inline-flex h-11 items-center gap-2 self-start text-sm font-semibold text-ink-2 hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {backLabel}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-cond text-4xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-1.5 max-w-prose text-ink-2">{summary}</p>
          <p className="mt-1 text-sm text-ink-3">{tip}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {children}
          <Button onClick={() => window.print()} size="lg">
            <Printer aria-hidden />
            Print
          </Button>
        </div>
      </div>
    </div>
  );
}
