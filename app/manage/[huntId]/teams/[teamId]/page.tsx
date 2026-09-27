import { ArrowLeft, EyeOff, Printer, RefreshCw, Trash } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/live/live-refresh";
import { ConfirmAction } from "@/components/staff/confirm-action";
import { StatCell, StatStrip } from "@/components/staff/stat-strip";
import { type MemberData, MemberRow } from "@/components/staff/teams/member-row";
import { TeamForm } from "@/components/staff/teams/team-form";
import { Numeral, Ordinal } from "@/components/ui/bib";
import { ControlMarker } from "@/components/ui/control";
import { CopyButton } from "@/components/ui/copy-button";
import { RelativeTime } from "@/components/ui/countdown";
import { StatusBadge } from "@/components/ui/status";
import { TeamAvatar } from "@/components/ui/team-badge";
import { requireStaff, roleAtLeast } from "@/lib/auth/access";
import { formatPoints, formatSigned, plural } from "@/lib/format";
import { formatCode } from "@/lib/ids";
import { getStandings, rankedCount, standingFor } from "@/lib/scoring/service";
import { hasScored } from "@/lib/staff/format";
import { getTeam, listTeams, teamAdjustments, teamMembers, teamSubmissions } from "@/lib/staff/queries";
import { deleteTeamAction, regenerateTeamCodeAction } from "@/lib/staff/team-actions";
import { absoluteUrl, links } from "@/lib/url";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: { params: Promise<{ huntId: string; teamId: string }> }) {
  const { huntId, teamId } = await params;
  const { hunt, role } = await requireStaff(huntId, "judge");
  const organizer = roleAtLeast(role, "organizer");
  const team = await getTeam(hunt.id, teamId);
  if (!team) notFound();

  const [members, subs, adjustments, allTeams, standings, inviteUrl] = await Promise.all([
    teamMembers(hunt.id, team.id),
    teamSubmissions(hunt.id, team.id),
    teamAdjustments(hunt.id, team.id),
    listTeams(hunt.id),
    getStandings(hunt.id),
    absoluteUrl(links.teamInvite(hunt.slug, team.code)),
  ]);
  const standing = standingFor(standings, team.id);
  const now = Date.now();
  const awards = standings.awards[team.id] ?? {};
  // Points show on the submission that earned them: each task's earliest accepted one.
  const earning = new Set<string>();
  const seenTask = new Set<string>();
  for (const s of [...subs].reverse()) {
    if (s.status !== "approved" || seenTask.has(s.taskId)) continue;
    seenTask.add(s.taskId);
    earning.add(s.id);
  }
  const otherTeams = allTeams.filter((t) => t.id !== team.id).map((t) => ({ id: t.id, name: t.name }));
  const memberData: MemberData[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    isCaptain: m.isCaptain,
    signedIn: m.sessionId != null,
    lastSeenAt: m.lastSeenAt.getTime(),
  }));

  return (
    <div className="flex flex-col gap-8">
      <LiveRefresh huntId={hunt.id} on={["teams.changed", "scores.changed"]} />
      <Link
        href={`/manage/${hunt.id}/teams`}
        className="-mb-4 inline-flex h-11 items-center gap-2 self-start text-sm font-semibold text-ink-2 hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        All teams
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex min-w-0 items-center gap-4">
          <TeamAvatar team={team} size="xl" />
          <div className="min-w-0">
            <h1 className="font-cond text-4xl font-extrabold tracking-tight text-balance wrap-anywhere">{team.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 text-ink-2">
              <span>{plural(members.length, "member")}</span>
              <span>{plural(subs.length, "submission")}</span>
              {team.hidden ? (
                <span className="inline-flex items-center gap-1 font-medium text-ink">
                  <EyeOff aria-hidden className="size-4" /> Hidden from the scoreboard
                </span>
              ) : null}
            </p>
          </div>
        </div>
        {standing ? (
          <div className="flex items-end gap-6">
            {standing.rank != null && hasScored(standing) ? (
              <p className="flex flex-col">
                <Ordinal n={standing.rank} className="text-6xl leading-none" />
                <span className="mt-1 text-sm text-ink-2">of {rankedCount(standings)}</span>
              </p>
            ) : null}
            <p className="flex flex-col">
              <Numeral className="text-6xl leading-none">{formatPoints(standing.total)}</Numeral>
              <span className="mt-1 text-sm text-ink-2">points, live</span>
            </p>
          </div>
        ) : null}
      </header>

      {standing ? (
        <StatStrip label="Where the points come from">
          <StatCell value={formatPoints(standing.taskPoints)} caption="Tasks" />
          <StatCell value={formatPoints(standing.contestPoints)} caption="Contests" />
          <StatCell value={standing.hintPenalty ? formatSigned(-standing.hintPenalty) : "0"} caption="Hints" />
          <StatCell value={formatSigned(standing.adjustmentPoints)} caption="Adjustments" />
        </StatStrip>
      ) : null}

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="members-heading" className="flex flex-col gap-3">
            <h2 id="members-heading" className="font-cond text-2xl font-bold">
              Members
            </h2>
            {memberData.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-2">
                Nobody has joined yet. Share the team code or print the team card.
              </p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {memberData.map((m) => (
                  <MemberRow
                    key={m.id}
                    huntId={hunt.id}
                    member={m}
                    otherTeams={otherTeams}
                    editable={organizer}
                    serverNow={now}
                  />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="subs-heading" className="flex flex-col gap-3">
            <h2 id="subs-heading" className="font-cond text-2xl font-bold">
              Submissions
            </h2>
            {subs.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-2">
                Nothing submitted yet.
              </p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {subs.map((s) => {
                  const points = earning.has(s.id) ? awards[s.taskId] : undefined;
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/manage/${hunt.id}/submissions/${s.id}`}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-mist"
                      >
                        <ControlMarker code={s.taskCode} size="sm" state={s.status} label={`Task ${s.taskCode}`} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-semibold">{s.taskTitle}</span>
                          <span className="truncate text-sm text-ink-2">
                            {s.playerName ? `${s.playerName}, ` : ""}
                            <RelativeTime at={s.createdAt.getTime()} serverNow={now} />
                            {s.contestValue != null
                              ? `, ${s.contestValue}${s.contestUnit ? ` ${s.contestUnit}` : ""}`
                              : ""}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <StatusBadge
                            status={s.status}
                            label={s.autoJudged && s.status === "approved" ? "Auto-accepted" : undefined}
                          />
                          {points != null ? (
                            <span className="font-bib text-sm text-ink-2">{formatSigned(points)}</span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="adj-heading" className="flex flex-col gap-3">
            <h2 id="adj-heading" className="font-cond text-2xl font-bold">
              Score adjustments
            </h2>
            {adjustments.length === 0 ? (
              <p className="text-sm text-ink-2">No bonuses or penalties so far.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {adjustments.map((a) => (
                  <li key={a.id} className="flex items-start gap-4 px-4 py-3">
                    <span className="w-16 shrink-0 font-bib text-2xl leading-none">{formatSigned(a.points)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block">{a.reason}</span>
                      <span className="text-sm text-ink-2">
                        {a.byName ? `${a.byName}, ` : ""}
                        <RelativeTime at={a.createdAt.getTime()} serverNow={now} />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-10">
          <section aria-labelledby="code-heading" className="rounded-lg border border-line p-5">
            <h2 id="code-heading" className="font-cond text-xl font-bold">
              Team code
            </h2>
            <p className="mt-1 text-sm text-ink-2">Teammates join with it, or by scanning the team card.</p>
            <p className="mt-3 font-bib text-5xl tracking-wide">
              <span aria-hidden>{formatCode(team.code)}</span>
              <span className="sr-only">{team.code.split("").join(" ")}</span>
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <CopyButton value={inviteUrl} label="Copy join link" copiedLabel="Link copied" />
              <Link
                href={`/manage/${hunt.id}/print/teams?ids=${team.id}`}
                className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold hover:bg-mist"
              >
                <Printer aria-hidden className="size-4" />
                Print card
              </Link>
            </div>
            {organizer ? (
              <div className="mt-4 border-t border-line pt-4">
                <ConfirmAction
                  action={regenerateTeamCodeAction}
                  fields={{ huntId: hunt.id, teamId: team.id }}
                  label="Generate a new code"
                  icon={<RefreshCw aria-hidden />}
                  variant="ghost"
                  size="sm"
                  title="Generate a new team code?"
                  description="The old code and the QR on its printed card stop working. Players already in the team stay in it."
                  confirmLabel="Generate new code"
                  confirmVariant="primary"
                />
              </div>
            ) : null}
          </section>

          {organizer ? (
            <section aria-labelledby="details-heading" className="flex flex-col gap-4">
              <h2 id="details-heading" className="font-cond text-2xl font-bold">
                Team details
              </h2>
              <TeamForm
                huntId={hunt.id}
                team={{ id: team.id, name: team.name, emoji: team.emoji, color: team.color, hidden: team.hidden }}
              />
            </section>
          ) : null}

          {organizer ? (
            <section aria-labelledby="delete-heading" className="rounded-lg border border-danger/40 p-5">
              <h2 id="delete-heading" className="font-cond text-xl font-bold">
                Delete team
              </h2>
              <p className="mt-1 text-sm text-ink-2">
                Removes the team, its members, submissions and photos, hint reveals and adjustments.
              </p>
              <ConfirmAction
                action={deleteTeamAction}
                fields={{ huntId: hunt.id, teamId: team.id }}
                label="Delete team"
                icon={<Trash aria-hidden />}
                variant="danger"
                size="sm"
                className="mt-4"
                title={`Delete “${team.name}”?`}
                description={`This removes ${plural(members.length, "member")}, ${plural(subs.length, "submission")} and their photos, plus hint reveals and adjustments. It can’t be undone.`}
                confirmLabel="Delete team"
                typeToConfirm={subs.length > 0 ? team.name : undefined}
              />
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
