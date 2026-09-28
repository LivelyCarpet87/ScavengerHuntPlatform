import { ArrowLeft, Eye } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DeleteSubmission } from "@/components/judge/delete-submission";
import { LocationLink, MediaStage, SubmissionText } from "@/components/judge/media-viewer";
import { RejudgePanel } from "@/components/judge/rejudge-panel";
import { SubmissionHistory } from "@/components/judge/submission-history";
import { TaskBrief } from "@/components/judge/task-brief";
import { LiveRefresh } from "@/components/live/live-refresh";
import { ButtonLink } from "@/components/ui/button";
import { ControlMarker } from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/countdown";
import { EmptyState } from "@/components/ui/empty-state";
import { Markdown } from "@/components/ui/markdown";
import { Notice } from "@/components/ui/misc";
import { StatusBadge, StatusGlyph } from "@/components/ui/status";
import { TeamBadge } from "@/components/ui/team-badge";
import { getStaffRole, requireStaff, roleAtLeast } from "@/lib/auth/access";
import { formatDateTime, formatPoints, ordinal } from "@/lib/format";
import { describeSubmissionEvent } from "@/lib/judging/activity";
import { isClaimLive } from "@/lib/judging/constants";
import { firstName, formatMeasured, possessive, statusLabel } from "@/lib/judging/labels";
import { loadSubmissionDetail, submissionTitle } from "@/lib/judging/submissions";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ huntId: string; submissionId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { huntId, submissionId } = await params;
  if (!(await getStaffRole(huntId))) return { title: "Submission" };
  return { title: (await submissionTitle(huntId, submissionId)) ?? "Submission" };
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-sm font-semibold text-ink-2 sm:w-32">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}

export default async function SubmissionPage({ params }: Props) {
  const { huntId, submissionId } = await params;
  const { hunt, role, user } = await requireStaff(huntId, "judge");
  const back = `/manage/${hunt.id}/submissions`;
  const detail = await loadSubmissionDetail(hunt, submissionId);

  if (!detail) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink href={back} />
        <EmptyState
          title="This submission is gone"
          action={
            <ButtonLink href={back} variant="secondary">
              Browse submissions
            </ButtonLink>
          }
        >
          It was deleted, or the link is from another hunt.
        </EmptyState>
      </div>
    );
  }

  const organizer = roleAtLeast(role, "organizer");
  const { task, team } = detail;
  const tz = hunt.timezone;
  const now = Date.now();
  const taskLabel = `${task.code} ${task.title}`;
  const claimedByOther = isClaimLive(detail.claim, user.id, now) && detail.status === "pending";
  const markerState = detail.status === "approved" ? "approved" : detail.status === "rejected" ? "rejected" : "pending";

  let result: ReactNode;
  if (detail.status === "pending") result = "Waiting for a judge";
  else if (detail.autoJudged)
    result = `${detail.status === "approved" ? "Accepted" : "Not accepted"} automatically${detail.judgedAt ? `, ${formatDateTime(detail.judgedAt, tz)}` : ""}`;
  else
    result = `${detail.status === "approved" ? "Accepted" : "Not accepted"} by ${detail.judgedBy ?? "a former judge"}${detail.judgedAt ? `, ${formatDateTime(detail.judgedAt, tz)}` : ""}`;

  let points: ReactNode = "None";
  if (detail.status === "approved" && task.kind === "contest") {
    points =
      detail.place != null
        ? // A team places once per contest (best, lowest or total of its entries).
          detail.place <= task.contestPlaces
          ? `${ordinal(detail.place)} place for ${team.name}, ${formatPoints(detail.award)} points`
          : `${team.name} is ${ordinal(detail.place)}, outside the ${task.contestPlaces} scoring places`
        : team.hidden
          ? "None: hidden teams don’t take contest places"
          : "Not ranked yet";
  } else if (detail.status === "approved") {
    points = detail.isSolve
      ? `${formatPoints(detail.award)}${detail.pointsOverride != null ? " (set by a judge)" : ""}`
      : "None: an earlier accepted submission already counts for this task";
  }

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh huntId={hunt.id} on={["submission.judged", "scores.changed"]} />
      <BackLink href={back} />

      <header className="flex items-start gap-4">
        <ControlMarker code={task.code} state={markerState} size="lg" className="max-sm:size-14" />
        <div className="min-w-0 flex-1">
          <h1 className="font-cond text-4xl font-extrabold tracking-tight">{task.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <TeamBadge team={team} size="sm" />
            <StatusBadge status={detail.status} label={statusLabel(detail.status, detail.autoJudged)} />
            <span className="text-sm text-ink-2">{task.kindLabel}</span>
          </div>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:grid-rows-[auto_1fr] lg:items-start xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          {claimedByOther && detail.claim ? (
            <Notice
              tone="info"
              icon={<Eye className="size-4" />}
              title={`${firstName(detail.claim.name)} has this open in the queue`}
            >
              If you both decide, only the first decision counts. The other one sees what was decided.
            </Notice>
          ) : null}

          {detail.files.length > 0 ? (
            <section aria-label="Photos and videos" className="flex flex-col gap-4">
              {detail.files.map((file, i) => (
                <div key={file.id} className="rounded-xl bg-mist p-3 sm:p-4">
                  {detail.files.length > 1 ? (
                    <p className="mb-2 text-sm font-semibold text-ink-2">
                      File {i + 1} of {detail.files.length}
                    </p>
                  ) : null}
                  <MediaStage
                    files={[file]}
                    keyboard={false}
                    alt={`${possessive(team.name)} ${file.kind === "video" ? "video" : "photo"} for ${taskLabel}`}
                    fitClassName="max-h-[75vh]"
                    zoomClassName="h-[75vh]"
                  />
                </div>
              ))}
            </section>
          ) : null}

          {detail.text ? (
            <SubmissionText
              text={detail.text}
              kind={task.kind === "answer" ? "answer" : task.kind === "checkpoint" ? "checkpoint" : "note"}
              prominent={detail.files.length === 0}
              className="rounded-xl bg-mist p-3 sm:p-4"
            />
          ) : null}
        </div>

        <aside className="flex flex-col gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-label="Decision">
          <section className="flex flex-col gap-4 rounded-lg border border-line p-4 sm:p-5">
            <h2 className="font-cond text-2xl font-bold">
              {hunt.status === "archived" ? "Result" : detail.status === "pending" ? "Decide" : "Change the result"}
            </h2>
            <RejudgePanel
              key={`${detail.id}:${detail.status}:${detail.judgedAt ?? "pending"}`}
              huntId={hunt.id}
              submission={{
                id: detail.id,
                status: detail.status,
                judgedAt: detail.judgedAt,
                createdAt: detail.createdAt,
                feedback: detail.feedback,
                pointsOverride: detail.pointsOverride,
                contestValue: detail.contestValue,
              }}
              task={task}
              team={team}
              teams={detail.teams}
              scoring={detail.scoring}
              templates={hunt.feedbackTemplates.filter((t) => t.trim().length > 0)}
              settingsHref={organizer ? `/manage/${hunt.id}/settings` : null}
              archived={hunt.status === "archived"}
            />
          </section>
          <TaskBrief
            task={task}
            description={detail.description.trim() ? <Markdown>{detail.description}</Markdown> : null}
            answerText={task.kind === "answer" ? detail.text : null}
            hideHeader
          />
          {organizer ? (
            <DeleteSubmission
              huntId={hunt.id}
              submissionId={detail.id}
              teamName={team.name}
              taskLabel={taskLabel}
              hasPoints={detail.status === "approved" && detail.award > 0}
              fileCount={detail.files.length}
            />
          ) : null}
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-2">
          <section aria-labelledby="facts">
            <h2 id="facts" className="font-cond text-2xl font-bold">
              Details
            </h2>
            <dl className="mt-1 divide-y divide-line border-y border-line">
              <Fact label="Sent">
                {formatDateTime(detail.createdAt, tz)} <span className="text-ink-2">({tz.replace(/_/g, " ")})</span>
                <span className="block text-sm text-ink-2">
                  <RelativeTime at={detail.createdAt} serverNow={now} />
                </span>
              </Fact>
              <Fact label="Sent by">{detail.playerName ?? "A player who has since left the team"}</Fact>
              <Fact label="Location">
                {detail.lat != null && detail.lng != null ? (
                  <LocationLink lat={detail.lat} lng={detail.lng} accuracy={detail.accuracy} />
                ) : (
                  <span className="text-ink-2">Not shared by the device</span>
                )}
              </Fact>
              <Fact label="Result">{result}</Fact>
              {task.kind === "contest" && detail.contestValue != null ? (
                <Fact label="Measured">{formatMeasured(detail.contestValue, task.contestUnit)}</Fact>
              ) : null}
              <Fact label="Points">{points}</Fact>
              {detail.feedback ? <Fact label="Feedback">{detail.feedback}</Fact> : null}
              <Fact label="Open">
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                  <Link
                    href={`/manage/${hunt.id}/teams/${team.id}`}
                    className="font-semibold underline decoration-line-strong decoration-2 underline-offset-2 hover:decoration-ink"
                  >
                    Team {team.name}
                  </Link>
                  {organizer ? (
                    <Link
                      href={`/manage/${hunt.id}/tasks/${task.id}`}
                      className="font-semibold underline decoration-line-strong decoration-2 underline-offset-2 hover:decoration-ink"
                    >
                      Task {taskLabel}
                    </Link>
                  ) : null}
                  <Link
                    href={`${back}?team=${team.id}`}
                    className="font-semibold underline decoration-line-strong decoration-2 underline-offset-2 hover:decoration-ink"
                  >
                    All from {team.name}
                  </Link>
                </span>
              </Fact>
            </dl>
          </section>

          <section aria-labelledby="trail" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="trail" className="font-cond text-2xl font-bold">
                History
              </h2>
              {organizer ? (
                <Link
                  href={`/manage/${hunt.id}/activity?group=judging`}
                  className="text-sm font-semibold text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink"
                >
                  All judging activity
                </Link>
              ) : null}
            </div>
            <ol className="flex flex-col">
              {detail.audit.map((entry) => {
                const event = describeSubmissionEvent(entry);
                const actor = entry.actorId === user.id ? "You" : (entry.actorName ?? "A former staff member");
                return (
                  <li key={entry.id} className="flex gap-3 border-l-2 border-line py-2 pl-4">
                    <TrailGlyph tone={event.tone} />
                    <div className="min-w-0">
                      <p>
                        <span className="font-semibold">{actor}</span> {event.text}
                      </p>
                      {event.detail ? <p className="text-sm text-ink-2">{event.detail}</p> : null}
                      <p className="text-xs text-ink-3" title={formatDateTime(entry.createdAt, tz)}>
                        <RelativeTime at={entry.createdAt} serverNow={now} />
                      </p>
                    </div>
                  </li>
                );
              })}
              {!detail.autoJudged && detail.judgedAt && detail.status !== "pending" && detail.audit.length === 0 ? (
                <li className="flex gap-3 border-l-2 border-line py-2 pl-4">
                  <TrailGlyph tone={detail.status === "approved" ? "approved" : "rejected"} />
                  <div>
                    <p>
                      <span className="font-semibold">{detail.judgedBy ?? "A former judge"}</span>{" "}
                      {detail.status === "approved" ? "approved it" : "rejected it"}
                    </p>
                    {detail.feedback ? <p className="text-sm text-ink-2">“{detail.feedback}”</p> : null}
                    <p className="text-xs text-ink-3" title={formatDateTime(detail.judgedAt, tz)}>
                      <RelativeTime at={detail.judgedAt} serverNow={now} />
                    </p>
                  </div>
                </li>
              ) : null}
              {detail.autoJudged && detail.judgedAt ? (
                <li className="flex gap-3 border-l-2 border-line py-2 pl-4">
                  <TrailGlyph tone={detail.status === "approved" ? "approved" : "rejected"} />
                  <div>
                    <p>
                      {detail.status === "approved" ? "Accepted" : "Not accepted"} automatically
                      {task.kind === "answer"
                        ? " by the answer check"
                        : task.kind === "checkpoint"
                          ? " at the checkpoint"
                          : ""}
                    </p>
                    <p className="text-xs text-ink-3" title={formatDateTime(detail.judgedAt, tz)}>
                      <RelativeTime at={detail.judgedAt} serverNow={now} />
                    </p>
                  </div>
                </li>
              ) : null}
              <li className="flex gap-3 border-l-2 border-line py-2 pl-4">
                <TrailGlyph tone="sent" />
                <div>
                  <p>
                    Sent by <span className="font-semibold">{detail.playerName ?? team.name}</span>
                  </p>
                  <p className="text-xs text-ink-3" title={formatDateTime(detail.createdAt, tz)}>
                    <RelativeTime at={detail.createdAt} serverNow={now} />
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <SubmissionHistory
            entries={detail.history}
            teamName={team.name}
            task={task}
            huntId={hunt.id}
            serverNow={now}
          />
        </div>
      </div>
    </div>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 self-start text-sm font-semibold text-ink-2 hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden />
      All submissions
    </Link>
  );
}

function TrailGlyph({ tone }: { tone: "approved" | "rejected" | "pending" | "neutral" | "sent" }) {
  if (tone === "approved" || tone === "rejected" || tone === "pending") {
    return (
      <StatusGlyph
        status={tone}
        className={cn(
          "-ml-[1.5625rem] mt-1 size-4 rounded-full bg-paper",
          tone === "approved" && "text-forest",
          tone === "rejected" && "text-danger",
          tone === "pending" && "text-sun-fg",
        )}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "-ml-[1.5625rem] mt-1.5 size-3 shrink-0 rounded-full border-2 bg-paper",
        tone === "sent" ? "border-accent" : "border-line-strong",
      )}
    />
  );
}
