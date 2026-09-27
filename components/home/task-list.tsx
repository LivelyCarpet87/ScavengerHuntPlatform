"use client";

import { Camera, Clapperboard, KeyRound, QrCode, Snowflake, Trophy, Video } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ControlMarker, type ControlState } from "@/components/ui/control";
import { StatusGlyph } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { groupByCategory } from "./task-order";

/*
 * The hunt home's task list: one row per visible task, grouped by category,
 * with filter chips (All / To do / In review / Done) kept in ?filter= so a
 * refresh or a shared link keeps the view. Filtering happens on the device.
 * While the hunt runs, each category lists what's left to do first, then
 * what's with the judges, then what's done (the organizer's order within
 * each), so the next task to pick is never buried under finished ones.
 */

export type TaskFilter = "all" | "todo" | "review" | "done";
export type TaskIcon = "photo" | "video" | "media" | "answer" | "checkpoint" | "contest";

export type TaskRowData = {
  id: string;
  href: string;
  code: number;
  title: string;
  kindLabel: string;
  icon: TaskIcon;
  category: string | null;
  /** Marker state (shape + color). */
  marker: ControlState;
  /** Which chip the task counts under; null for tasks that can't be done any more. */
  bucket: Exclude<TaskFilter, "all"> | null;
  /** `frozen`: earned after the scoreboard froze, so the value is hidden for now. */
  points: { value: string | null; caption: string; muted?: boolean; frozen?: boolean; srText: string };
  status: { tone: "pending" | "rejected" | "approved" | "neutral"; text: string } | null;
};

const FILTERS: { key: TaskFilter; label: string; empty: string }[] = [
  { key: "all", label: "All", empty: "" },
  { key: "todo", label: "To do", empty: "Nothing left to do. Every task is done or waiting for a judge." },
  { key: "review", label: "In review", empty: "Nothing waiting for a judge right now." },
  { key: "done", label: "Done", empty: "No tasks done yet. Pick one and go for it." },
];

const ICONS: Record<TaskIcon, typeof Camera> = {
  photo: Camera,
  video: Video,
  media: Clapperboard,
  answer: KeyRound,
  checkpoint: QrCode,
  contest: Trophy,
};

const MARKER_WORDS: Record<ControlState, string> = {
  todo: "to do",
  pending: "in review",
  approved: "done",
  rejected: "not accepted",
  locked: "closed",
};

function isFilter(v: string | null): v is TaskFilter {
  return v === "all" || v === "todo" || v === "review" || v === "done";
}

export function TaskList({
  rows,
  over = false,
}: {
  rows: TaskRowData[];
  /** The hunt has finished: nothing is left to do. */
  over?: boolean;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const raw = searchParams.get("filter");
  const filters = over ? FILTERS.filter((f) => f.key !== "todo") : FILTERS;
  const filter: TaskFilter = isFilter(raw) && filters.some((f) => f.key === raw) ? raw : "all";

  const counts: Record<TaskFilter, number> = { all: rows.length, todo: 0, review: 0, done: 0 };
  for (const r of rows) if (r.bucket) counts[r.bucket] += 1;

  const setFilter = (next: TaskFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("filter");
    else params.set("filter", next);
    const qs = params.toString();
    // Shallow URL update: Next's router picks it up without a server round trip.
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };

  const shown = filter === "all" ? rows : rows.filter((r) => r.bucket === filter);
  const groups = groupByCategory(shown, !over);
  const empty = FILTERS.find((f) => f.key === filter)?.empty;

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="-mx-4 min-w-0 overflow-x-auto px-4 [scrollbar-width:none]">
        <legend className="sr-only">Show tasks</legend>
        <div className="flex min-w-max gap-1.5">
          {filters.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "flex h-11 shrink-0 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-semibold transition-colors",
                  active
                    ? "border-ink bg-ink text-paper"
                    : "border-line bg-paper text-ink-2 hover:border-line-strong hover:text-ink",
                )}
              >
                {f.label}
                <span className="font-bib text-base leading-none">{counts[f.key]}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {shown.length === 0 ? (
        <p className="rounded-lg bg-mist px-4 py-6 text-center text-ink-2">{empty}</p>
      ) : (
        // A plain block per category: its heading gives the structure, without a landmark per category.
        groups.map((group) => (
          <div key={group.name ?? "_"}>
            {group.name ? (
              <h3 className="mt-2 mb-1 font-cond text-lg font-bold tracking-tight text-ink-2">{group.name}</h3>
            ) : null}
            <ul className="divide-y divide-line border-y border-line">
              {group.rows.map((row) => (
                <li key={row.id}>
                  <TaskRow row={row} />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

function TaskRow({ row }: { row: TaskRowData }) {
  const Icon = ICONS[row.icon];
  return (
    <Link
      href={row.href}
      className="group -mx-2 flex min-h-[4.5rem] items-center gap-3.5 rounded-md px-2 py-3 transition-colors hover:bg-mist"
    >
      <ControlMarker code={row.code} state={row.marker} label={`Control ${row.code}, ${MARKER_WORDS[row.marker]}`} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold leading-snug">{row.title}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <Icon aria-hidden className="size-3.5" />
            {row.kindLabel}
          </span>
          {row.status ? <StatusLine status={row.status} /> : null}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end text-right">
        <span className="sr-only">{row.points.srText}</span>
        <span aria-hidden className="text-xs text-ink-2">
          {row.points.caption}
        </span>
        {row.points.value == null && row.points.frozen ? (
          <Snowflake aria-hidden className="mt-0.5 size-6 text-ink-2" />
        ) : (
          <span
            aria-hidden
            className={cn("font-bib text-2xl leading-none", row.points.muted ? "text-ink-3" : "text-ink")}
          >
            {row.points.value ?? "–"}
          </span>
        )}
      </span>
    </Link>
  );
}

function StatusLine({ status }: { status: NonNullable<TaskRowData["status"]> }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium",
        status.tone === "pending" && "text-ink",
        status.tone === "rejected" && "text-danger",
        status.tone === "approved" && "text-forest",
        status.tone === "neutral" && "text-ink-2",
      )}
    >
      {status.tone !== "neutral" ? <StatusGlyph status={status.tone} /> : null}
      {status.text}
    </span>
  );
}
