"use client";

import { ArrowDown, ArrowUp, Clock, EyeOff, Lightbulb, Lock } from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { ControlMarker } from "@/components/ui/control";
import { toast } from "@/components/ui/toast";
import { ordinal } from "@/lib/format";
import { moveTaskAction } from "@/lib/staff/task-actions";
import { cn } from "@/lib/utils";

export type TaskRowData = {
  id: string;
  code: number;
  title: string;
  kindLabel: string;
  isContest: boolean;
  category: string | null;
  scoringValue: string;
  scoringNote: string;
  hidden: boolean;
  /** "Unlocks 20:25" etc., already formatted in the hunt's time zone. */
  unlock: string | null;
  close: string | null;
  closed: boolean;
  solves: number;
  hints: number;
};

/**
 * The task list, laid out like an orienteering control description sheet
 * (a heavier rule every third row). Rows reorder with Move up / Move down
 * buttons: the change shows instantly, focus stays on the button you pressed,
 * and screen readers hear the new position.
 */
export function TaskList({ huntId, rows }: { huntId: string; rows: TaskRowData[] }) {
  const [optimistic, setOptimistic] = useOptimistic(rows);
  const [, startTransition] = useTransition();
  const [announcement, setAnnouncement] = useState("");

  // Reordering moves DOM nodes, which drops focus; put it back once the new order is on screen.
  const focusAfter = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!focusAfter.current || optimistic.length === 0) return;
    document.getElementById(focusAfter.current)?.focus();
    focusAfter.current = null;
  }, [optimistic]);

  const move = (id: string, direction: "up" | "down") => {
    const from = optimistic.findIndex((r) => r.id === id);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= optimistic.length) return;
    const next = [...optimistic];
    [next[from], next[to]] = [next[to], next[from]];
    const title = optimistic[from].title;
    // If the row reached the top or bottom, its pressed button is now disabled: use the other one.
    const atEdge = to === 0 ? "up" : to === next.length - 1 ? "down" : null;
    focusAfter.current = `move-${atEdge === direction ? (direction === "up" ? "down" : "up") : direction}-${id}`;
    startTransition(async () => {
      setOptimistic(next);
      const result = await moveTaskAction({ huntId, taskId: id, direction });
      if (result && !result.ok) {
        toast({ title: "Couldn’t move the task", description: result.error, tone: "danger" });
        return;
      }
      setAnnouncement(`Moved “${title}” ${direction}. Now ${ordinal(to + 1)} of ${next.length}.`);
    });
  };

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <ol className="divide-y divide-line rounded-lg border border-line">
        {optimistic.map((row, i) => (
          <li
            key={row.id}
            className={cn(
              "relative flex items-start gap-3 px-3 py-3 transition-colors hover:bg-mist sm:gap-4 sm:px-4",
              i % 3 === 2 && i !== optimistic.length - 1 && "border-b-2 border-b-line-strong",
            )}
          >
            <ControlMarker code={row.code} state={row.hidden ? "locked" : "todo"} label={`Task ${row.code}`} />
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-x-6 gap-y-1.5 md:grid-cols-[minmax(0,1fr)_9rem_8rem] md:items-center">
              <div className="min-w-0">
                <Link
                  href={`/manage/${huntId}/tasks/${row.id}`}
                  className="font-semibold wrap-anywhere after:absolute after:inset-0 after:content-[''] hover:underline decoration-2 underline-offset-2"
                >
                  {row.title}
                </Link>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink-2">
                  <span>{row.kindLabel}</span>
                  {row.category ? (
                    <span className="rounded-xs bg-mist-2 px-1.5 py-px text-xs font-medium text-ink-2">
                      {row.category}
                    </span>
                  ) : null}
                  {row.hidden ? (
                    <span className="inline-flex items-center gap-1 font-medium text-ink">
                      <EyeOff aria-hidden className="size-3.5" /> Hidden
                    </span>
                  ) : null}
                  {row.unlock ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock aria-hidden className="size-3.5" /> {row.unlock}
                    </span>
                  ) : null}
                  {row.close ? (
                    <span className={cn("inline-flex items-center gap-1", row.closed && "font-medium text-ink")}>
                      <Lock aria-hidden className="size-3.5" /> {row.close}
                    </span>
                  ) : null}
                </p>
              </div>
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm md:flex-col md:items-start md:gap-0">
                <span className="font-bib text-lg leading-tight whitespace-nowrap text-ink">{row.scoringValue}</span>
                <span className="text-ink-2">{row.scoringNote}</span>
              </p>
              <p className="flex items-center gap-3 text-sm text-ink-2 md:flex-col md:items-start md:gap-0.5">
                <span>
                  <span className="font-semibold text-ink">{row.solves}</span> {row.isContest ? "ranked" : "solved"}
                </span>
                {row.hints > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Lightbulb aria-hidden className="size-3.5" />
                    {row.hints === 1 ? "1 hint" : `${row.hints} hints`}
                  </span>
                ) : null}
              </p>
            </div>
            <div className="relative z-10 flex shrink-0 gap-1 self-center">
              <button
                id={`move-up-${row.id}`}
                type="button"
                onClick={() => move(row.id, "up")}
                disabled={i === 0}
                aria-label={`Move “${row.title}” up`}
                className="grid size-11 place-items-center rounded-md text-ink-2 hover:bg-mist-2 hover:text-ink disabled:opacity-30"
              >
                <ArrowUp className="size-4" />
              </button>
              <button
                id={`move-down-${row.id}`}
                type="button"
                onClick={() => move(row.id, "down")}
                disabled={i === optimistic.length - 1}
                aria-label={`Move “${row.title}” down`}
                className="grid size-11 place-items-center rounded-md text-ink-2 hover:bg-mist-2 hover:text-ink disabled:opacity-30"
              >
                <ArrowDown className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
