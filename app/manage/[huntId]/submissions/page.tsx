import type { Metadata } from "next";
import Link from "next/link";
import { DownloadLink } from "@/components/judge/download-link";
import { SubmissionFilters } from "@/components/judge/submission-filters";
import { SubmissionRows, SubmissionRowsHeader } from "@/components/judge/submission-rows";
import { LiveRefresh } from "@/components/live/live-refresh";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice, PageHeader } from "@/components/ui/misc";
import { requireStaff } from "@/lib/auth/access";
import { SUBMISSIONS_PAGE_SIZE } from "@/lib/judging/constants";
import { deletedSubmissionLabel, loadSubmissionList, STATUS_TABS, type StatusTab } from "@/lib/judging/submissions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Submissions" };

type Props = {
  params: Promise<{ huntId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(value: string | string[] | undefined, max = 64): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  return v.length > 0 && v.length <= max ? v : null;
}

export default async function SubmissionsPage({ params, searchParams }: Props) {
  const { huntId } = await params;
  const sp = await searchParams;
  const { hunt } = await requireStaff(huntId, "judge");

  const statusParam = one(sp.status);
  const status: StatusTab = STATUS_TABS.some((t) => t.key === statusParam) ? (statusParam as StatusTab) : "all";
  const filters = {
    status,
    task: one(sp.task),
    team: one(sp.team),
    q: one(sp.q, 100),
    page: Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1),
  };
  const list = await loadSubmissionList(hunt, filters);
  // Only filters that belong to this hunt (the loader drops the rest).
  const { task, team } = list;
  // Confirm a deletion from its audit entry (never echo text from the URL).
  const deletedId = one(sp.deleted);
  const deleted = deletedId ? await deletedSubmissionLabel(hunt.id, deletedId) : null;

  const path = `/manage/${hunt.id}/submissions`;
  const href = (patch: Partial<{ status: StatusTab; page: number }>) => {
    const p = new URLSearchParams();
    const s = patch.status ?? status;
    if (s !== "all") p.set("status", s);
    if (task) p.set("task", task);
    if (team) p.set("team", team);
    if (filters.q) p.set("q", filters.q);
    const page = patch.page ?? 1;
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    return qs ? `${path}?${qs}` : path;
  };
  const filtered = !!(task || team || filters.q);
  // The judging queue understands the same task and team filters.
  const queueQuery = new URLSearchParams([
    ...(task ? [["task", task]] : []),
    ...(team ? [["team", team]] : []),
  ]).toString();
  const first = list.total === 0 ? 0 : (list.page - 1) * SUBMISSIONS_PAGE_SIZE + 1;
  const last = Math.min(list.total, list.page * SUBMISSIONS_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh huntId={hunt.id} on={["submission.created", "submission.judged", "scores.changed"]} />
      <PageHeader
        title="Submissions"
        description="Every photo, answer and entry teams have sent, newest first. Open one to change its result."
        actions={<DownloadLink href={`/api/hunts/${hunt.id}/export/submissions.csv`}>Download all as CSV</DownloadLink>}
      />

      {deleted ? <Notice tone="success">Deleted {deleted}.</Notice> : null}

      <nav aria-label="Status" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <ul className="flex min-w-max gap-1 border-b border-line">
          {STATUS_TABS.map((tab) => {
            const active = tab.key === status;
            return (
              <li key={tab.key}>
                <Link
                  href={href({ status: tab.key })}
                  aria-current={active ? "page" : undefined}
                  scroll={false}
                  className={cn(
                    "relative flex h-11 items-center gap-2 px-3 text-sm font-semibold text-ink-2 transition-colors hover:text-ink",
                    active &&
                      "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-[3px] after:rounded-full after:bg-accent",
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 font-bib text-xs leading-none",
                      tab.key === "pending" && list.counts.pending > 0 ? "bg-sun text-sun-ink" : "bg-mist text-ink-2",
                    )}
                  >
                    {list.counts[tab.key]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {filtered || list.counts.all > 0 ? (
        <SubmissionFilters
          action={path}
          status={status}
          task={task}
          team={team}
          q={filters.q}
          tasks={list.tasks}
          teams={list.teams}
        />
      ) : null}

      {status === "pending" && list.rows.length > 0 ? (
        <p className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
          The judging queue shows these oldest first, with keyboard shortcuts.
          <Link
            href={`/manage/${hunt.id}/judge${queueQuery ? `?${queueQuery}` : ""}`}
            className="font-semibold text-ink underline decoration-2 underline-offset-2"
          >
            Judge them in the queue
          </Link>
        </p>
      ) : null}

      {list.rows.length === 0 ? (
        filtered || status !== "all" ? (
          <EmptyState title="Nothing matches" mascot={false} className="rounded-lg bg-mist">
            {status !== "all" && list.counts.all > 0
              ? "Try another status or clear the filters."
              : "No submissions match these filters."}{" "}
            <Link href={path} className="font-semibold text-ink underline decoration-2 underline-offset-2">
              Show everything
            </Link>
          </EmptyState>
        ) : (
          <EmptyState title="No submissions yet">
            Photos, answers and contest entries appear here the moment teams send them.
          </EmptyState>
        )
      ) : (
        <section aria-label="Submissions">
          <SubmissionRowsHeader />
          <SubmissionRows rows={list.rows} huntId={hunt.id} serverNow={Date.now()} />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-sm text-ink-2">
              Showing {first}–{last} of {list.total}
            </p>
            {list.pages > 1 ? (
              <div className="flex gap-2">
                {list.page > 1 ? (
                  <ButtonLink href={href({ page: list.page - 1 })} variant="quiet" size="sm">
                    Newer
                  </ButtonLink>
                ) : null}
                {list.page < list.pages ? (
                  <ButtonLink href={href({ page: list.page + 1 })} variant="quiet" size="sm">
                    Older
                  </ButtonLink>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
