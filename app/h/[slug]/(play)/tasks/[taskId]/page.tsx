import { and, asc, eq } from "drizzle-orm";
import {
  ArrowLeft,
  Camera,
  Clapperboard,
  Download,
  EyeOff,
  FileText,
  Hourglass,
  KeyRound,
  Lock,
  QrCode,
  Timer,
  Trophy,
  Video,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache, type ReactNode } from "react";
import { LiveRefresh } from "@/components/live/live-refresh";
import { ActionBarSpacer } from "@/components/task/action-bar";
import { ContestRanking } from "@/components/task/contest-ranking";
import { HintList, type HintView } from "@/components/task/hint-list";
import { MediaStrip } from "@/components/task/media-strip";
import { SubmissionCard, toMediaItems } from "@/components/task/submission-card";
import { TaskActionArea } from "@/components/task/task-action-area";
import type { ActionTask, TeamTaskState } from "@/components/task/task-types";
import { Numeral } from "@/components/ui/bib";
import { ButtonLink } from "@/components/ui/button";
import { ControlMarker, type ControlState } from "@/components/ui/control";
import { Countdown } from "@/components/ui/countdown";
import { EmptyState } from "@/components/ui/empty-state";
import { Markdown } from "@/components/ui/markdown";
import { Notice } from "@/components/ui/misc";
import { PunchMark } from "@/components/ui/punch";
import { StatusGlyph } from "@/components/ui/status";
import { getPlayerHunt } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { type FileRow, type Hunt, hints, type Submission, type Task, tasks } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { formatBytes, formatDateTime, formatPoints, formatTime, ordinal, plural } from "@/lib/format";
import { canViewScoreboard, huntPhase, isTaskVisible, scoreboardCutoff, submissionBlockReason } from "@/lib/hunts";
import { getRevealedHints, getTaskSubmissions } from "@/lib/player/progress";
import { getStandings } from "@/lib/scoring/service";
import { filesFor, fileUrl } from "@/lib/storage";
import { acceptAttr, describeScoring, judgingNote, kindLabel, taskAvailability } from "@/lib/tasks";
import { links } from "@/lib/url";
import { cn } from "@/lib/utils";

type Params = Promise<{ slug: string; taskId: string }>;

/** One task of one hunt. Memoized per request (the page and its metadata both need it). */
const getHuntTask = cache(async (huntId: string, taskId: string): Promise<Task | null> => {
  const task = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.huntId, huntId)))
    .get();
  return task ?? null;
});

/** The hunt, the viewer and the task. Who may see what is decided by the page. */
async function loadTask(slug: string, taskId: string) {
  const ctx = await getPlayerHunt(slug);
  return { ...ctx, task: await getHuntTask(ctx.hunt.id, taskId) };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, taskId } = await params;
  const { hunt, me, staffRole, task } = await loadTask(slug, taskId);
  if (!task) return {};
  const started = huntPhase(hunt) !== "upcoming" && huntPhase(hunt) !== "draft";
  if (staffRole || (me && started && isTaskVisible(task))) return { title: `${task.title} (${task.code})` };
  return {};
}

const KIND_ICONS = {
  photo: Camera,
  video: Video,
  media: Clapperboard,
  answer: KeyRound,
  checkpoint: QrCode,
  contest: Trophy,
} as const;

function kindIcon(task: Pick<Task, "kind" | "mediaAccept">) {
  if (task.kind !== "media") return KIND_ICONS[task.kind];
  return task.mediaAccept === "video"
    ? KIND_ICONS.video
    : task.mediaAccept === "any"
      ? KIND_ICONS.media
      : KIND_ICONS.photo;
}

const STATE_WORDS: Record<ControlState, string> = {
  todo: "to do",
  pending: "waiting for a judge",
  approved: "done",
  rejected: "not accepted",
  locked: "closed",
};

function sectionTitle(task: Pick<Task, "kind" | "mediaAccept">): string {
  switch (task.kind) {
    case "answer":
      return "Your answer";
    case "checkpoint":
      return "Punch this control";
    case "contest":
      return "Your entry";
    case "media":
      return task.mediaAccept === "video"
        ? "Your video"
        : task.mediaAccept === "any"
          ? "Your photo or video"
          : "Your photo";
  }
}

/** What teams do here, for staff previewing the task. */
function staffPreviewText(task: Pick<Task, "kind" | "mediaAccept" | "answers">): string {
  switch (task.kind) {
    case "answer":
      return task.answers.length > 0
        ? "Teams type an answer here and learn straight away whether it's right."
        : "Teams type an answer here; it waits in the judging queue.";
    case "checkpoint":
      return "Teams scan the poster's QR code here, or type the code printed under it. It counts instantly.";
    case "contest":
      return "Teams send entries here (media, a note, or both) and can keep sending more. Judges record a value for each accepted entry.";
    case "media":
      return "Teams take or choose up to 4 files here, add a note and their location, then send them to the judging queue.";
  }
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-cond text-2xl font-bold tracking-tight">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Attachments({ files, title }: { files: FileRow[]; title: string }) {
  if (files.length === 0) return null;
  const media = files.filter((f) => f.kind === "image" || f.kind === "video");
  const other = files.filter((f) => f.kind !== "image" && f.kind !== "video");
  const single = media.length === 1 && media[0].kind === "image" ? media[0] : null;
  return (
    <div className="flex flex-col gap-3">
      {single ? (
        // biome-ignore lint/performance/noImgElement: access-checked task attachment, not optimizable
        <img
          src={fileUrl(single, "display")}
          alt={single.originalName ? `Attachment: ${single.originalName}` : `Picture for ${title}`}
          width={single.width ?? undefined}
          height={single.height ?? undefined}
          className="h-auto max-h-[70dvh] w-full rounded-lg border border-line bg-mist object-contain"
        />
      ) : media.length > 0 ? (
        // Pictures are part of the clue, so they're shown large; tap one to see all of it.
        <MediaStrip items={toMediaItems(media)} label={`Pictures for ${title}`} size="gallery" />
      ) : null}
      {other.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {other.map((f) => (
            <li key={f.id}>
              <a
                href={`${fileUrl(f, "original")}?download`}
                className="flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-mist"
                download
              >
                <FileText aria-hidden className="size-5 shrink-0 text-ink-2" />
                <span className="min-w-0 flex-1 truncate font-medium">{f.originalName ?? `File.${f.ext}`}</span>
                <span className="shrink-0 text-sm text-ink-2">{formatBytes(f.size)}</span>
                <Download aria-hidden className="size-4 shrink-0 text-ink-2" />
                <span className="sr-only">Download</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Why the team's last try was turned down, up top where the player looks first. */
function RejectedNotice({
  sub,
  files,
  kind,
  open,
}: {
  sub: Submission;
  files: FileRow[];
  kind: Task["kind"];
  open: boolean;
}) {
  const media = toMediaItems(files);
  return (
    <section aria-label="Your last try" className="flex flex-col gap-3 rounded-lg bg-danger-wash px-4 py-4">
      <div className="flex items-start gap-3">
        <StatusGlyph status="rejected" className="mt-1 size-4 text-danger" />
        <div className="min-w-0">
          <p className="font-semibold">{open ? "Not accepted — try again" : "Not accepted"}</p>
          {sub.feedback ? (
            <p className="mt-1 text-ink">
              <span className="font-semibold">The judge says: </span>
              {sub.feedback}
            </p>
          ) : open ? (
            <p className="mt-0.5 text-sm text-ink-2">
              {kind === "answer" ? "Send a new answer below." : "Send new proof below."}
            </p>
          ) : null}
        </div>
      </div>
      {media.length > 0 || sub.text ? (
        <div className="flex flex-wrap items-center gap-3 pl-7">
          {media.length > 0 ? <MediaStrip items={media} label="Your last try" size="sm" /> : null}
          {sub.text ? (
            <p className="line-clamp-2 min-w-0 flex-1 text-sm text-ink-2">
              {kind === "answer" ? `“${sub.text}”` : sub.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function NotStartedYet({ hunt }: { hunt: Pick<Hunt, "slug" | "startsAt" | "timezone"> }) {
  const now = Date.now();
  return (
    <EmptyState
      title="The hunt hasn't started yet"
      action={
        <ButtonLink href={links.hunt(hunt.slug)} variant="secondary" size="lg">
          Back to the hunt
        </ButtonLink>
      }
    >
      {hunt.startsAt ? (
        <>
          Tasks open when it starts, at {formatDateTime(hunt.startsAt, hunt.timezone)}. That's in{" "}
          <Countdown to={hunt.startsAt.getTime()} serverNow={now} className="text-lg text-ink" />.
        </>
      ) : (
        "Tasks open when the organizers start it."
      )}
    </EmptyState>
  );
}

export default async function TaskPage({ params }: { params: Params }) {
  const { slug, taskId } = await params;
  const { hunt, me, staffRole, task } = await loadTask(slug, taskId);
  if (!me && !staffRole) {
    redirect(`${links.hunt(slug)}?next=${encodeURIComponent(links.task(slug, taskId))}`);
  }
  if (!task) notFound();

  const nowDate = new Date();
  const now = nowDate.getTime();
  const phase = huntPhase(hunt, nowDate);
  const isStaff = !!staffRole;
  if (!isStaff) {
    if (!isTaskVisible(task, nowDate)) notFound();
    if (phase === "upcoming" || phase === "draft") return <NotStartedYet hunt={hunt} />;
  }

  const tz = hunt.timezone;
  const viewer = { isStaff, isPlayer: !!me };
  const cutoff = scoreboardCutoff(hunt, viewer, nowDate);
  const teamId = me?.team.id ?? null;

  const [subs, hintRows, revealed, taskFiles, standings] = await Promise.all([
    teamId ? getTaskSubmissions(teamId, task.id) : Promise.resolve([] as Submission[]),
    db
      .select()
      .from(hints)
      .where(and(eq(hints.taskId, task.id), eq(hints.huntId, hunt.id)))
      .orderBy(asc(hints.sortOrder), asc(hints.createdAt)),
    teamId ? getRevealedHints(teamId) : Promise.resolve(new Set<string>()),
    filesFor("task", [task.id]),
    getStandings(hunt.id, { cutoff }),
  ]);
  const live = cutoff ? await getStandings(hunt.id) : standings;
  const subFiles = await filesFor(
    "submission",
    subs.map((s) => s.id),
  );

  // The team's standing on the task (same rules as the task list).
  const contest = task.kind === "contest";
  const approvedSubs = subs.filter((s) => s.status === "approved");
  const solve = approvedSubs.reduce<Submission | null>((a, b) => (!a || b.createdAt < a.createdAt ? b : a), null);
  const newest = subs[0] ?? null;
  const state: TeamTaskState = solve
    ? "approved"
    : !newest
      ? "todo"
      : newest.status === "pending"
        ? "pending"
        : "rejected";
  const wrongAttempts = subs.filter((s) => s.status === "rejected").length;
  const outOfAttempts =
    task.kind === "answer" && task.maxAttempts != null && wrongAttempts >= task.maxAttempts && !solve;

  const availability = taskAvailability(task, hunt, nowDate);
  const blockReason = submissionBlockReason(hunt, task, nowDate);
  const open = !blockReason;
  const markerState: ControlState =
    state === "approved" || state === "pending" ? state : open && !outOfAttempts ? state : "locked";

  // What the team holds for this task, as of the freeze. A standard task solved after the freeze
  // falls back to live points (the team already saw them arrive); a contest doesn't, because its
  // points give away places the freeze is hiding.
  const earned = teamId
    ? (standings.awards[teamId]?.[task.id] ?? (contest ? null : live.awards[teamId]?.[task.id]) ?? null)
    : null;
  const stat = standings.tasks[task.id];
  const nextValue = stat?.nextValue ?? task.points;
  const boardVisible = canViewScoreboard(hunt, viewer);
  const myPlace =
    contest && teamId && boardVisible ? (stat?.contest?.find((e) => e.teamId === teamId)?.place ?? null) : null;

  // The newest submission gets shown in the action area when it's waiting or was turned down by a judge.
  const showLatest =
    !!newest &&
    !contest &&
    !solve &&
    (newest.status === "pending" || (newest.status === "rejected" && !(task.kind === "answer" && newest.autoJudged)));
  const latestCard =
    showLatest && newest ? (
      <SubmissionCard
        sub={newest}
        files={subFiles[newest.id] ?? []}
        task={task}
        timeZone={tz}
        hideFeedback
        className="rounded-lg border border-line px-4 py-3.5"
      />
    ) : null;
  const history = subs.filter((s) => !(showLatest && s.id === newest?.id));

  const actionTask: ActionTask = {
    id: task.id,
    code: task.code,
    title: task.title,
    kind: task.kind,
    mediaAccept: task.mediaAccept,
    maxAttempts: task.maxAttempts,
    contestRank: task.contestRank,
    contestUnit: task.contestUnit,
    autoChecked: task.kind === "answer" && task.answers.length > 0,
  };

  const staffPreview = isStaff && !me;
  const hintViews: HintView[] = hintRows.map((h, i) => ({
    id: h.id,
    number: i + 1,
    cost: h.cost,
    body: staffPreview ? h.body : revealed.has(h.id) ? h.body : null,
  }));
  // No point paying for a hint once the task is done, closed or out of attempts.
  const canRevealHints = !!me && open && !outOfAttempts && (contest || !solve);
  // Once hints can't be revealed any more, only the ones the team paid for are worth showing.
  const shownHints = staffPreview || canRevealHints ? hintViews : hintViews.filter((h) => h.body);
  const revealedCount = hintViews.filter((h) => h.body).length;

  const Icon = kindIcon(task);
  const showsActionBar =
    !!me && open && !outOfAttempts && (contest || state === "todo" || state === "rejected") && task.kind !== "answer";

  return (
    <div className="flex flex-col gap-8">
      {/* submission.created: a teammate just sent something for this task. Staff previews show no team data. */}
      <LiveRefresh
        huntId={hunt.id}
        on={
          me
            ? ["submission.judged", "tasks.changed", "scores.changed", "submission.created"]
            : ["submission.judged", "tasks.changed", "scores.changed"]
        }
      />

      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={links.hunt(slug)}
            className="-ml-2 inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-ink-2 hover:bg-mist hover:text-ink"
          >
            <ArrowLeft aria-hidden className="size-4" />
            All tasks
          </Link>
          {task.category ? <span className="truncate text-sm font-medium text-ink-2">{task.category}</span> : null}
        </div>

        {isStaff && task.hidden ? (
          <Notice tone="warning" icon={<EyeOff className="size-4" />} title="Hidden from players">
            Only staff can open this task. Players who follow a link to it are told it isn't open.
          </Notice>
        ) : null}

        <header className="flex items-start gap-4">
          <ControlMarker
            code={task.code}
            state={me ? markerState : "todo"}
            size="lg"
            label={`Control ${task.code}${me ? `, ${STATE_WORDS[markerState]}` : ""}`}
          />
          <div className="min-w-0 flex-1 pt-1">
            <h1
              className={cn(
                "font-cond font-extrabold tracking-tight text-balance break-words",
                task.title.length > 40 ? "text-3xl sm:text-4xl" : "text-4xl",
              )}
            >
              {task.title}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-mist px-2.5 py-1 font-semibold">
                <Icon aria-hidden className="size-3.5" />
                {kindLabel(task)}
              </span>
              <span className="text-ink-2">{judgingNote(task)}</span>
            </p>
          </div>
        </header>

        <div className="flex flex-col gap-2 border-y border-line py-4">
          {me && (contest ? earned != null && earned !== 0 : !!solve) ? (
            <div className="flex items-center gap-4">
              <span className="relative grid size-16 shrink-0 place-items-center rounded-md border-2 border-accent bg-accent-wash text-accent">
                <span className="absolute top-1 left-1.5 font-bib text-[0.7rem] leading-none">{task.code}</span>
                <PunchMark seed={task.id} size={46} />
              </span>
              {earned ? (
                <p className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold">
                  You earned <Numeral className="text-5xl leading-none">{formatPoints(earned)}</Numeral>
                  {contest && myPlace ? (
                    <span className="text-base font-medium text-ink-2">
                      for {ordinal(myPlace)} place{phase === "live" ? " so far" : ""}
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="text-lg font-semibold">
                  Punched
                  <span className="block text-base font-medium text-ink-2">This one doesn't score points.</span>
                </p>
              )}
            </div>
          ) : nextValue === 0 && !contest ? (
            <p className="text-lg font-semibold">
              {task.scoring === "fixed" ? "Just for fun" : "No points left"}
              <span className="block text-base font-medium text-ink-2">
                {task.scoring === "fixed"
                  ? "This task doesn't score points."
                  : "Enough teams have solved it that it no longer scores."}
              </span>
            </p>
          ) : (
            <p className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold">
              {contest ? "Worth up to" : "Worth"}
              <Numeral className="text-5xl leading-none">{formatPoints(nextValue)}</Numeral>
              {task.scoring !== "fixed" && !contest && open ? "now" : "points"}
            </p>
          )}
          {contest || task.scoring !== "fixed" ? <p className="text-sm text-ink-2">{describeScoring(task)}</p> : null}
          {availability.state === "upcoming" && availability.until ? (
            <p className="flex items-center gap-2 text-sm font-medium">
              <Hourglass aria-hidden className="size-4 text-ink-2" />
              {phase === "upcoming" || phase === "draft" ? "The hunt starts in" : "Opens for players in"}{" "}
              <Countdown to={availability.until.getTime()} serverNow={now} className="text-base" />
            </p>
          ) : null}
          {availability.state === "open" && task.lockAt ? (
            <p className="flex items-center gap-2 text-sm font-medium">
              <Timer aria-hidden className="size-4 text-ink-2" />
              Closes at {formatTime(task.lockAt, tz)}, in{" "}
              <Countdown to={task.lockAt.getTime()} serverNow={now} className="text-base" />
            </p>
          ) : null}
          {availability.state === "closed" && !me ? (
            <p className="flex items-center gap-2 text-sm font-medium text-ink-2">
              <Lock aria-hidden className="size-4" />
              {availability.since ? `Closed at ${formatTime(availability.since, tz)}.` : "Closed."}
            </p>
          ) : null}
        </div>

        {me && showLatest && newest?.status === "rejected" ? (
          <RejectedNotice sub={newest} files={subFiles[newest.id] ?? []} kind={task.kind} open={open} />
        ) : null}

        {task.description ? <Markdown className="text-[1.0625rem]">{task.description}</Markdown> : null}
        <Attachments files={taskFiles[task.id] ?? []} title={task.title} />
      </div>

      {shownHints.length > 0 ? (
        <Section
          title="Hints"
          aside={
            me ? (
              <span className="text-sm text-ink-2">
                {revealedCount} of {hintViews.length} revealed
              </span>
            ) : null
          }
        >
          <HintList hints={shownHints} canReveal={canRevealHints} staffView={staffPreview} />
        </Section>
      ) : null}

      {staffPreview ? (
        <Section title="What teams do here">
          <p className="text-ink-2">{staffPreviewText(task)}</p>
          {task.kind === "answer" && task.answers.length > 0 ? (
            <p className="text-sm text-ink-2">
              <span className="font-semibold text-ink">
                {task.answerMatch === "regex" ? "Accepted patterns: " : "Accepted answers: "}
              </span>
              {task.answers.map((a) => `“${a}”`).join(", ")}
              {task.answerMatch === "loose"
                ? " (case, accents, spacing and a leading “the” or “a” don't matter)"
                : task.answerMatch === "exact"
                  ? " (must match exactly, including capitals)"
                  : null}
            </p>
          ) : null}
          {task.kind === "checkpoint" && task.checkpointCode ? (
            <p className="text-sm text-ink-2">
              <span className="font-semibold text-ink">Poster code: </span>
              <span className="font-bib text-lg tracking-wider text-ink">{task.checkpointCode}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`${links.manage(hunt.id)}/judge`} variant="secondary">
              Open the judging queue
            </ButtonLink>
          </div>
        </Section>
      ) : null}

      {me ? (
        <Section title={sectionTitle(task)}>
          <TaskActionArea
            huntId={hunt.id}
            slug={slug}
            task={actionTask}
            state={state}
            closedReason={blockReason}
            huntOver={phase === "ended" || phase === "archived"}
            closedNote={
              phase === "ended" || phase === "archived" ? (
                <Link href={links.scoreboard(slug)} className="font-semibold text-ink underline underline-offset-2">
                  See the final scoreboard
                </Link>
              ) : availability.state === "closed" && availability.since ? (
                `It closed at ${formatTime(availability.since, tz)}. The other tasks are still open.`
              ) : null
            }
            wrongAttempts={wrongAttempts}
            punchedAt={solve ? formatTime(solve.createdAt, tz) : null}
            accept={acceptAttr(task)}
            maxUploadBytes={env.maxUploadBytes}
            latest={newest?.status === "pending" ? latestCard : null}
            pendingEntries={contest ? subs.filter((s) => s.status === "pending").length : 0}
          />
        </Section>
      ) : null}

      {contest ? (
        <Section title="Ranking">
          {boardVisible ? (
            <ContestRanking task={task} standings={standings} myTeamId={teamId} timeZone={tz} />
          ) : (
            <p className="text-ink-2">The organizers keep the ranking hidden until they announce the results.</p>
          )}
        </Section>
      ) : null}

      {me && history.length > 0 ? (
        <Section
          title={contest ? "Your entries" : showLatest ? "Earlier submissions" : "Your team's submissions"}
          aside={
            <span className="text-sm text-ink-2">
              {plural(history.length, contest ? "entry" : "submission", contest ? "entries" : "submissions")}
            </span>
          }
        >
          <ol className="flex flex-col divide-y divide-line border-y border-line">
            {history.map((sub) => (
              <li key={sub.id} className="py-4">
                <SubmissionCard
                  sub={sub}
                  files={subFiles[sub.id] ?? []}
                  task={task}
                  timeZone={tz}
                  points={contest ? null : sub.id === solve?.id ? (earned ?? sub.pointsOverride) || null : null}
                />
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {showsActionBar ? <ActionBarSpacer /> : null}
    </div>
  );
}
