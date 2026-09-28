import { CircleCheck, EyeOff, Plus, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LiveRefresh } from "@/components/live/live-refresh";
import { ArchivedNotice } from "@/components/staff/archived-notice";
import { AddTeamsDialog } from "@/components/staff/teams/add-teams-dialog";
import { Numeral, Ordinal } from "@/components/ui/bib";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice, PageHeader } from "@/components/ui/misc";
import { TeamAvatar } from "@/components/ui/team-badge";
import { requireStaff, roleAtLeast } from "@/lib/auth/access";
import { formatPoints, plural } from "@/lib/format";
import { formatCode } from "@/lib/ids";
import { getStandings } from "@/lib/scoring/service";
import { hasScored } from "@/lib/staff/format";
import { isArchived } from "@/lib/staff/guards";
import { staffTitle } from "@/lib/staff/metadata";
import { auditData, listTeams, memberCounts, submissionCountsByTeam } from "@/lib/staff/queries";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ huntId: string }> }): Promise<Metadata> {
  return staffTitle((await params).huntId, "Teams");
}

export default async function TeamsPage({
  params,
  searchParams,
}: {
  params: Promise<{ huntId: string }>;
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { huntId } = await params;
  const sp = await searchParams;
  const { hunt, role } = await requireStaff(huntId, "judge");
  const organizer = roleAtLeast(role, "organizer");
  // Archived hunts are read-only: no new teams.
  const archived = isArchived(hunt);
  const canAdd = organizer && !archived;
  const [teamRows, members, subs, standings, deletedData] = await Promise.all([
    listTeams(hunt.id),
    memberCounts(hunt.id),
    submissionCountsByTeam(hunt.id),
    getStandings(hunt.id),
    sp.deleted ? auditData(hunt.id, "team.delete", sp.deleted) : null,
  ]);

  const byId = new Map(teamRows.map((t) => [t.id, t]));
  // Scoreboard order: ranked teams first, hidden (test) teams last.
  const rows = standings.standings.flatMap((s) => {
    const team = byId.get(s.teamId);
    return team ? [{ team, standing: s }] : [];
  });
  // Test (hidden) teams' members aren't counted, matching the overview.
  const players = teamRows.filter((t) => !t.hidden).reduce((sum, t) => sum + (members.get(t.id) ?? 0), 0);
  const hiddenCount = teamRows.filter((t) => t.hidden).length;
  const deleted = typeof deletedData?.name === "string" ? deletedData.name : null;

  return (
    <div className={cn("flex flex-col gap-6", canAdd && "pb-24 md:pb-0")}>
      <LiveRefresh huntId={hunt.id} on={["teams.changed", "scores.changed"]} />
      <PageHeader
        title="Teams"
        description={
          teamRows.length === 0
            ? "Teams register with the hunt code, or you add them here."
            : `${plural(teamRows.length - hiddenCount, "team")} and ${plural(players, "player")}${hiddenCount ? `, plus ${plural(hiddenCount, "hidden test team")}` : ""}. Live scores, as staff see them.`
        }
        actions={
          <>
            {teamRows.length > 0 ? (
              <ButtonLink href={`/manage/${hunt.id}/print/teams`} variant="secondary">
                <Printer aria-hidden />
                Print team cards
              </ButtonLink>
            ) : null}
            {canAdd ? (
              <AddTeamsDialog huntId={hunt.id} placement="responsive" showTrigger={teamRows.length > 0} />
            ) : null}
          </>
        }
      />

      {deleted ? (
        <Notice tone="success" icon={<CircleCheck className="size-4" />} title={`Deleted “${deleted}”`}>
          Its members, submissions and points are gone, and the scoreboard has been recalculated.
        </Notice>
      ) : null}

      {archived && organizer ? <ArchivedNotice huntId={hunt.id} /> : null}

      {rows.length === 0 ? (
        <EmptyState
          title={archived ? "No teams" : "No teams yet"}
          action={
            canAdd ? (
              <ButtonLink href={`/manage/${hunt.id}/teams?add=1`} scroll={false}>
                <Plus aria-hidden />
                Add teams
              </ButtonLink>
            ) : undefined
          }
        >
          {archived
            ? "Nobody took part in this hunt before it was archived."
            : "Teams appear here as soon as players register with the hunt code. You can also add them yourself and hand out printed team cards at the start."}
        </EmptyState>
      ) : (
        <ol className="divide-y divide-line rounded-lg border border-line">
          {rows.map(({ team, standing }) => {
            const memberCount = members.get(team.id) ?? 0;
            const subCount = subs.get(team.id) ?? 0;
            return (
              <li key={team.id}>
                <Link
                  href={`/manage/${hunt.id}/teams/${team.id}`}
                  className={cn(
                    "grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-mist",
                    "md:grid-cols-[2.5rem_minmax(0,1fr)_7rem_7rem_8rem_6.5rem] md:gap-x-4",
                  )}
                >
                  <span className="text-2xl leading-none">
                    {standing.rank != null && hasScored(standing) ? (
                      <Ordinal n={standing.rank} />
                    ) : (
                      <>
                        <span aria-hidden className="font-bib text-ink-3">
                          –
                        </span>
                        <span className="sr-only">{team.hidden ? "Not ranked" : "No points yet"}</span>
                      </>
                    )}
                  </span>
                  <span className="flex min-w-0 items-center gap-3">
                    <TeamAvatar team={team} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold">{team.name}</span>
                      <span className="flex flex-wrap items-center gap-x-3 text-sm text-ink-2 md:hidden">
                        <span className="font-bib tracking-wide">{formatCode(team.code)}</span>
                        <span>{plural(memberCount, "member")}</span>
                      </span>
                      {team.hidden ? (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-ink">
                          <EyeOff aria-hidden className="size-3.5" /> Hidden
                          <span className="hidden sm:inline"> from the scoreboard</span>
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="hidden font-bib text-lg tracking-wide md:block">
                    <span className="sr-only">Team code </span>
                    {formatCode(team.code)}
                  </span>
                  <span className="hidden text-sm text-ink-2 md:block">{plural(memberCount, "member")}</span>
                  <span className="hidden text-sm text-ink-2 md:block">{plural(subCount, "submission")}</span>
                  <span className="text-right">
                    <Numeral className="text-2xl leading-none">{formatPoints(standing.total)}</Numeral>
                    <span className="block text-xs text-ink-2">points</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
