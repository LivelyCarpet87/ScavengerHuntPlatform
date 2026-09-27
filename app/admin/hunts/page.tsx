import type { Metadata } from "next";
import Link from "next/link";
import { HuntPhaseChip } from "@/components/shells/staff-shell";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdmin } from "@/lib/auth/access";
import { formatDate, plural } from "@/lib/format";
import type { HuntPhase } from "@/lib/hunts";
import { listHuntsForAdmin } from "@/lib/platform/admin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Hunts" };

const COLUMNS = "md:grid md:grid-cols-[minmax(0,1fr)_7rem_minmax(0,10rem)_4rem_7rem_15rem] md:items-center md:gap-4";

const PHASE_WORDS: Record<HuntPhase, [string, string]> = {
  live: ["live", "live"],
  upcoming: ["scheduled", "scheduled"],
  draft: ["draft", "drafts"],
  ended: ["finished", "finished"],
  archived: ["archived", "archived"],
};

function summary(counts: Map<HuntPhase, number>): string {
  const parts: string[] = [];
  for (const phase of ["live", "upcoming", "draft", "ended", "archived"] as HuntPhase[]) {
    const n = counts.get(phase);
    if (n) parts.push(`${n} ${PHASE_WORDS[phase][n === 1 ? 0 : 1]}`);
  }
  return parts.join(", ");
}

export default async function AdminHuntsPage() {
  await requireAdmin();
  const hunts = await listHuntsForAdmin();

  if (hunts.length === 0) {
    return (
      <EmptyState
        title="No hunts yet"
        action={
          <ButtonLink href="/dashboard/new" size="lg">
            Create a hunt
          </ButtonLink>
        }
      >
        Hunts that anyone on this server creates show up here, with their owners and teams.
      </EmptyState>
    );
  }

  const counts = new Map<HuntPhase, number>();
  for (const h of hunts) counts.set(h.phase, (counts.get(h.phase) ?? 0) + 1);

  return (
    <div>
      <p className="text-ink-2">
        {plural(hunts.length, "hunt")}: {summary(counts)}
      </p>

      <div
        className={cn("mt-6 hidden border-b border-line pb-2 text-sm font-semibold text-ink-2", COLUMNS)}
        aria-hidden
      >
        <span>Hunt</span>
        <span>Status</span>
        <span>Owner</span>
        <span className="text-right">Teams</span>
        <span>Created</span>
        <span />
      </div>
      <ul className="divide-y divide-line border-b border-line md:border-b-0">
        {hunts.map((h) => (
          <li key={h.id} className={cn("flex flex-col gap-3 py-4", COLUMNS)}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/manage/${h.id}`}
                  className="truncate font-cond text-xl leading-tight font-extrabold tracking-tight hover:underline"
                >
                  {h.name}
                </Link>
                <HuntPhaseChip hunt={h} className="md:hidden" />
              </div>
              <p className="truncate text-sm text-ink-2">/h/{h.slug}</p>
              <dl className="mt-2 grid grid-cols-3 gap-3 text-sm md:hidden">
                <div className="min-w-0">
                  <dt className="text-ink-2">Owner</dt>
                  <dd className="truncate font-medium">{h.owners.join(", ") || "Admins only"}</dd>
                </div>
                <div>
                  <dt className="text-ink-2">Teams</dt>
                  <dd className="font-bib text-lg leading-tight">{h.teamCount}</dd>
                </div>
                <div>
                  <dt className="text-ink-2">Created</dt>
                  <dd className="font-medium">{formatDate(h.createdAt)}</dd>
                </div>
              </dl>
            </div>
            <div className="hidden md:block">
              <HuntPhaseChip hunt={h} />
            </div>
            <p className="hidden truncate text-sm md:block" title={h.owners.join(", ")}>
              {h.owners.join(", ") || <span className="text-ink-2">Admins only</span>}
            </p>
            <span className="hidden text-right font-bib text-xl md:block">{h.teamCount}</span>
            <time dateTime={h.createdAt.toISOString()} className="hidden text-sm text-ink-2 md:block">
              {formatDate(h.createdAt)}
            </time>
            <div className="flex gap-2 md:justify-end">
              <ButtonLink href={`/manage/${h.id}`} variant="quiet">
                Manage<span className="sr-only"> {h.name}</span>
              </ButtonLink>
              <ButtonLink href={`/h/${h.slug}`} variant="ghost">
                Player page<span className="sr-only"> for {h.name}</span>
              </ButtonLink>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
