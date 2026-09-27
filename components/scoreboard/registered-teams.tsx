"use client";

import { TeamAvatar } from "@/components/ui/team-badge";
import type { StandingRow } from "@/lib/live/types";
import { YouTag } from "./podium";
import { useLiveStandings } from "./use-live-standings";

/** Before the start: who is lined up, alphabetically, without scores. New teams appear as they register. */
export function RegisteredTeams({
  huntId,
  rows: serverRows,
  updatedAt,
  viewerTeamId,
}: {
  huntId: string;
  rows: StandingRow[];
  /** When `rows` were computed (StandingsPayload.updatedAt). */
  updatedAt: string;
  viewerTeamId: string | null;
}) {
  const rows = useLiveStandings(huntId, serverRows, updatedAt);
  const teams = rows.filter((r) => !r.hidden).sort((a, b) => a.name.localeCompare(b.name));
  if (teams.length === 0) {
    return <p className="text-ink-2">No teams have registered yet.</p>;
  }
  return (
    <section aria-labelledby="registered-teams">
      <h2 id="registered-teams" className="flex items-baseline gap-2 font-cond text-2xl font-bold">
        On the start line
        <span className="font-bib text-xl text-ink-2">{teams.length}</span>
      </h2>
      <ul className="mt-2 divide-y divide-line">
        {teams.map((team) => (
          <li key={team.teamId} className="flex min-h-14 items-center gap-3 py-2">
            <TeamAvatar team={team} />
            <span className="min-w-0 flex-1 truncate font-semibold">{team.name}</span>
            {team.teamId === viewerTeamId ? <YouTag /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
