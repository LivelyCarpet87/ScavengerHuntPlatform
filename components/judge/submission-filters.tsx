"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type Values = { task: string; team: string; q: string };

/**
 * Task, team and text filters for the submissions browser. Filters live in
 * the URL (shareable, reload-safe): the selects apply as soon as they change,
 * the search applies on Enter or "Search". It's still a plain GET form, so it
 * works before the page's JavaScript loads. On phones the form folds away
 * behind one button unless a filter is active.
 */
export function SubmissionFilters({
  action,
  status,
  task,
  team,
  q,
  tasks,
  teams,
}: {
  action: string;
  status: string;
  task: string | null;
  team: string | null;
  q: string | null;
  tasks: { id: string; code: number; title: string }[];
  teams: { id: string; name: string }[];
}) {
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Values>({ task: task ?? "", team: team ?? "", q: q ?? "" });
  const active = [task, team, q].filter(Boolean).length;
  const [open, setOpen] = useState(active > 0);

  // Follow the URL when it changes elsewhere: status tabs, "Clear", back and forward.
  useEffect(() => {
    setValues((v) =>
      v.task === (task ?? "") && v.team === (team ?? "") && v.q === (q ?? "")
        ? v
        : { task: task ?? "", team: team ?? "", q: q ?? "" },
    );
    if (task || team || q) setOpen(true);
  }, [task, team, q]);

  const apply = (next: Values) => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (next.task) params.set("task", next.task);
    if (next.team) params.set("team", next.team);
    if (next.q.trim()) params.set("q", next.q.trim());
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${action}?${qs}` : action, { scroll: false }));
  };
  const change = (patch: Partial<Values>) => {
    const next = { ...values, ...patch };
    setValues(next);
    apply(next);
  };
  const clearHref = status === "all" ? action : `${action}?status=${status}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 md:hidden">
        <Button
          variant={active ? "secondary" : "quiet"}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={`${id}-form`}
        >
          <SlidersHorizontal aria-hidden />
          {active ? `Filters (${active})` : "Filter and search"}
        </Button>
        {active ? (
          <Link
            href={clearHref}
            scroll={false}
            className="flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-ink-2 hover:bg-mist hover:text-ink"
          >
            <X className="size-4" aria-hidden />
            Clear
          </Link>
        ) : null}
      </div>
      <form
        id={`${id}-form`}
        method="get"
        action={action}
        aria-label="Filter submissions"
        onSubmit={(e) => {
          e.preventDefault();
          apply(values);
        }}
        className={cn("grid-cols-1 gap-3 md:grid md:grid-cols-[1fr_1fr_1.5fr]", open ? "grid" : "hidden")}
      >
        {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-task`} className="text-sm font-semibold">
            Task
          </label>
          <Select id={`${id}-task`} name="task" value={values.task} onChange={(e) => change({ task: e.target.value })}>
            <option value="">All tasks</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} {t.title}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-team`} className="text-sm font-semibold">
            Team
          </label>
          <Select id={`${id}-team`} name="team" value={values.team} onChange={(e) => change({ team: e.target.value })}>
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-q`} className="text-sm font-semibold">
            Search answers, notes and feedback
          </label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
              />
              <Input
                id={`${id}-q`}
                name="q"
                type="search"
                value={values.q}
                onChange={(e) => setValues((v) => ({ ...v, q: e.target.value }))}
                maxLength={100}
                placeholder="gargoyle"
                className="pl-10"
              />
            </div>
            <Button type="submit" variant="secondary" className="h-12" pending={pending}>
              Search
            </Button>
          </div>
        </div>
        {active ? (
          <p className="hidden text-sm text-ink-2 md:col-span-3 md:block">
            <Link
              href={clearHref}
              scroll={false}
              className="font-semibold text-ink underline decoration-2 underline-offset-2"
            >
              Clear filters
            </Link>
          </p>
        ) : null}
      </form>
    </div>
  );
}
