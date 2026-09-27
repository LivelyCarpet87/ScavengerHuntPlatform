"use client";

import { Maximize, Minimize, Snowflake, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { requestRefresh } from "@/components/live/refresh";
import { useHuntEvents } from "@/components/live/use-hunt-events";
import { useNow } from "@/components/ui/clock";
import { FinishMark, StartMark } from "@/components/ui/control";
import { Countdown } from "@/components/ui/countdown";
import { TeamAvatar } from "@/components/ui/team-badge";
import type { Accent } from "@/lib/db/schema";
import { formatDateTime, formatTime } from "@/lib/format";
import { type FeedPayload, isBoardEmpty, type StandingsPayload } from "@/lib/live/types";
import type { HuntEventType } from "@/lib/realtime/bus";
import { cn } from "@/lib/utils";
import { ActivityList, Ticker } from "./activity";
import { FinalPodium } from "./final-podium";
import { PhotoWall, type WallPhoto } from "./photo-wall";
import { ScreenStandings } from "./screen-standings";
import { useActivity, useFullscreen, useWakeLock } from "./use-screen-chrome";

export type ScreenHunt = {
  id: string;
  name: string;
  accent: Accent;
  timezone: string;
  /** Scoreboard freeze (ISO), so the screen can switch to "frozen" right on time. */
  freezeAt: string | null;
};

export type ScreenJoin = {
  /** Absolute URL encoded in the QR code. */
  url: string;
  /** The same URL without the protocol, for reading off the wall. */
  display: string;
  /** "482 913" */
  code: string;
  qr: ReactNode;
};

const REFRESH_ON: HuntEventType[] = [
  "submission.judged",
  "scores.changed",
  "teams.changed",
  "announcement.created",
  "tasks.changed",
  "hunt.changed",
];
const POLL_MS = 15_000;
const DAY = 24 * 60 * 60 * 1000;

/**
 * The projector at event HQ. Night-O by default for contrast, sized for
 * 16:9 and readable from the back of a room: standings on the left (sliding
 * when ranks change), the latest accepted photos on the right, a crawl of
 * recent punches along the bottom, and a QR code to join while
 * registration is open. Live via SSE, with a 15 s poll as a safety net.
 */
export function BigScreen({
  hunt,
  initialStandings,
  initialFeed,
  join,
  backdrop,
  serverNow,
}: {
  hunt: ScreenHunt;
  initialStandings: StandingsPayload;
  initialFeed: FeedPayload;
  join: ScreenJoin | null;
  backdrop: ReactNode;
  serverNow: number;
}) {
  const router = useRouter();
  const [standings, setStandings] = useState(initialStandings);
  const [feed, setFeed] = useState(initialFeed);
  const [offline, setOffline] = useState(false);
  const seq = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useWakeLock();
  const active = useActivity(3000);
  const fullscreen = useFullscreen();

  // A server re-render (hunt settings changed) brings fresh data too.
  useEffect(() => setStandings(initialStandings), [initialStandings]);
  useEffect(() => setFeed(initialFeed), [initialFeed]);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    const init: RequestInit = { cache: "no-store", headers: { accept: "application/json" } };
    try {
      const [s, f] = await Promise.all([
        fetch(`/api/hunts/${hunt.id}/standings?audience=room`, init),
        fetch(`/api/hunts/${hunt.id}/feed?audience=room&limit=40`, init),
      ]);
      if (s.status === 404 || f.status === 404) {
        // Visibility changed under us: let the server decide what to show.
        router.refresh();
        return;
      }
      if (!s.ok || !f.ok) throw new Error(`HTTP ${s.status}/${f.status}`);
      const [nextStandings, nextFeed] = (await Promise.all([s.json(), f.json()])) as [StandingsPayload, FeedPayload];
      if (mine !== seq.current) return; // a newer refresh is on its way
      setStandings(nextStandings);
      setFeed(nextFeed);
      setOffline(false);
    } catch {
      if (mine === seq.current) setOffline(true);
    }
  }, [hunt.id, router]);

  const schedule = useCallback(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void refresh(), 400);
  }, [refresh]);

  useHuntEvents(
    hunt.id,
    (e) => {
      if (e.type === "hunt.changed") requestRefresh(router);
      if (REFRESH_ON.includes(e.type)) schedule();
    },
    {
      // Missed events that couldn't be replayed (the server restarted): reload everything.
      onResync: () => {
        requestRefresh(router);
        schedule();
      },
    },
  );

  useEffect(() => {
    const t = setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      clearTimeout(debounce.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, schedule]);

  // Start, freeze and finish happen on the clock: refresh right after each.
  const { startsAt, endsAt, frozenAt } = standings;
  const freezeAt = hunt.freezeAt;
  useEffect(() => {
    const now = Date.now();
    const next = [startsAt, freezeAt, endsAt]
      .map((iso) => (iso ? new Date(iso).getTime() : null))
      .filter((t): t is number => t != null && t > now)
      .sort((a, b) => a - b)[0];
    if (next == null || next - now > DAY) return;
    const t = setTimeout(
      () => {
        router.refresh();
        void refresh();
      },
      next - now + 800,
    );
    return () => clearTimeout(t);
  }, [startsAt, freezeAt, endsAt, router, refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && !e.altKey) void fullscreen.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen.toggle]);

  const phase = standings.phase;
  const finished = phase === "ended" || phase === "archived";
  const started = phase === "live" || finished;
  const rows = standings.standings.filter((r) => !r.hidden);
  const empty = isBoardEmpty(rows);
  const photos: WallPhoto[] = feed.galleryOpen ? wallPhotos(feed) : [];
  // Before the start, and while a live hunt has no teams yet, the board is a start line.
  const waiting = !started || (phase === "live" && rows.length === 0);
  const announcements = feed.items.filter((item) => item.kind === "announcement");

  // Right-hand column: photos or the latest punches once the race is on; the
  // join code (big while waiting); announcements when there is nothing else.
  let side: ReactNode = null;
  if (!waiting) {
    side =
      photos.length > 0 ? (
        <PhotoWall photos={photos} serverNow={serverNow} />
      ) : (
        <LatestPlate items={feed.items} serverNow={serverNow} />
      );
  } else if (!join && announcements.length > 0) {
    side = <LatestPlate items={announcements} serverNow={serverNow} />;
  }
  const hasAside = side != null || join != null;

  return (
    <div
      data-accent={hunt.accent}
      className={cn(
        "relative flex min-h-dvh flex-col bg-paper text-ink lg:h-dvh lg:overflow-hidden",
        !active && "cursor-none",
      )}
    >
      {backdrop}

      <header className="relative flex flex-wrap items-end gap-x-10 gap-y-3 px-4 pt-6 pb-4 sm:px-6 lg:flex-nowrap lg:px-[2.6rem] lg:pt-[1.9rem] lg:pb-[1.3rem]">
        <div className="flex min-w-0 items-center gap-5">
          {finished ? (
            <FinishMark size={56} className="size-[3.6rem]" />
          ) : (
            <StartMark size={56} className="size-[3.4rem]" />
          )}
          <h1 className="min-w-0 font-cond text-5xl leading-[0.9] font-extrabold tracking-tight lg:truncate lg:text-[4.6rem]">
            {hunt.name}
          </h1>
        </div>
        <div className="flex items-end gap-8 lg:ml-auto">
          {offline ? (
            <span className="mb-2 inline-flex items-center gap-2 rounded-full bg-mist-2 px-3 py-1 text-[1rem] font-semibold text-ink-2">
              <WifiOff aria-hidden className="size-[1.1rem]" /> Reconnecting
            </span>
          ) : null}
          <PhaseBadge phase={phase} frozen={!!frozenAt} />
          <HeaderClock
            phase={phase}
            startsAt={startsAt}
            endsAt={endsAt}
            timezone={hunt.timezone}
            serverNow={serverNow}
          />
        </div>
      </header>

      <main
        id="main"
        className={cn(
          "relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-8 px-4 pb-6 sm:px-6 lg:gap-[2.6rem] lg:px-[2.6rem] lg:pb-[1.4rem]",
          hasAside && "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
        )}
      >
        <div className="flex min-h-0 flex-col gap-4">
          {frozenAt && phase === "live" ? (
            <p className="flex items-center gap-3 rounded-lg bg-sun-wash px-5 py-3 text-[1.35rem] font-semibold text-sun-fg">
              <Snowflake aria-hidden className="size-[1.5rem] shrink-0" />
              Scoreboard frozen — final reveal at the finish
            </p>
          ) : null}
          {waiting ? (
            <StartLine rows={rows} canJoin={!!join} started={started} />
          ) : rows.length === 0 ? (
            <Plate>
              <p className="px-6 py-10 text-[1.8rem] font-semibold">No teams took part in this hunt.</p>
            </Plate>
          ) : finished && !empty ? (
            <FinalPodium rows={rows} />
          ) : (
            <Plate className="flex flex-col px-3 py-2 lg:min-h-0 lg:flex-1 lg:px-4 lg:py-3">
              {empty ? (
                <p className="px-2 pt-1 pb-3 text-[1.3rem] text-ink-2">
                  {finished
                    ? "No team scored before the finish."
                    : "No points yet. The first team to get a task accepted takes the lead."}
                </p>
              ) : null}
              <ScreenStandings rows={rows} empty={empty} />
            </Plate>
          )}
        </div>

        {hasAside ? (
          <div className="flex min-h-0 flex-col gap-5">
            {side}
            {join ? <JoinBlock join={join} large={waiting} /> : null}
          </div>
        ) : null}
      </main>

      {feed.items.length > 0 ? (
        <footer className="relative flex h-[4.4rem] shrink-0 items-center gap-4 border-t border-line bg-paper px-4 sm:px-6 lg:px-[2.6rem]">
          <span className="shrink-0 font-cond text-[1.5rem] font-extrabold">Latest</span>
          <Ticker items={feed.items} />
        </footer>
      ) : null}

      {fullscreen.supported ? (
        <button
          type="button"
          onClick={() => void fullscreen.toggle()}
          className={cn(
            "fixed top-4 left-1/2 z-10 hidden h-11 -translate-x-1/2 items-center gap-2 rounded-md bg-raised px-4 text-sm font-semibold text-ink shadow-pop transition-opacity duration-300 lg:inline-flex",
            "focus-visible:opacity-100",
            active ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          {fullscreen.isFullscreen ? (
            <Minimize aria-hidden className="size-4" />
          ) : (
            <Maximize aria-hidden className="size-4" />
          )}
          {fullscreen.isFullscreen ? "Exit full screen" : "Full screen"}
        </button>
      ) : null}
    </div>
  );
}

function wallPhotos(feed: FeedPayload): WallPhoto[] {
  const out: WallPhoto[] = [];
  for (const item of feed.items) {
    if (item.kind !== "punch") continue;
    for (const m of item.media) {
      if (!m.display) continue;
      out.push({
        key: m.id,
        src: m.display,
        thumb: m.thumb ?? m.display,
        video: m.kind === "video",
        team: item.team,
        task: item.task,
        at: item.at,
      });
    }
  }
  return out.slice(0, 12);
}

function Plate({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-line bg-paper", className)}>{children}</div>;
}

function LatestPlate({ items, serverNow }: { items: FeedPayload["items"]; serverNow: number }) {
  return (
    <Plate className="flex min-h-0 flex-1 flex-col px-6 py-5">
      <h2 className="mb-4 font-cond text-[1.9rem] font-extrabold">Latest</h2>
      <ActivityList items={items} serverNow={serverNow} />
    </Plate>
  );
}

function PhaseBadge({ phase, frozen }: { phase: StandingsPayload["phase"]; frozen: boolean }) {
  if (phase === "live" && frozen) {
    return (
      <span className="mb-2 inline-flex items-center gap-2 text-[1.3rem] font-semibold text-ink-2">
        <Snowflake aria-hidden className="size-[1.3rem]" /> Frozen
      </span>
    );
  }
  if (phase === "live") {
    return (
      <span className="mb-2 inline-flex items-center gap-2.5 text-[1.3rem] font-bold text-danger">
        <span aria-hidden className="size-[0.85rem] rounded-full bg-danger animate-live" />
        Live
      </span>
    );
  }
  if (phase === "ended" || phase === "archived") {
    return <span className="mb-1 font-cond text-[2.2rem] leading-none font-extrabold">Final results</span>;
  }
  return null;
}

function HeaderClock({
  phase,
  startsAt,
  endsAt,
  timezone,
  serverNow,
}: {
  phase: StandingsPayload["phase"];
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  serverNow: number;
}) {
  const now = useNow(serverNow);
  const start = startsAt ? new Date(startsAt).getTime() : null;
  const end = endsAt ? new Date(endsAt).getTime() : null;

  if ((phase === "upcoming" || phase === "draft") && start) {
    return start - now > DAY ? (
      <p className="text-right">
        <span className="block text-[1.1rem] text-ink-2">Starts</span>
        <span className="font-bib text-[2.6rem] leading-none">{formatDateTime(start, timezone)}</span>
      </p>
    ) : (
      <ClockFigure to={start} serverNow={serverNow} caption="to the start" />
    );
  }
  if (phase === "live" && end) return <ClockFigure to={end} serverNow={serverNow} caption="left" />;
  if ((phase === "ended" || phase === "archived") && end) {
    return (
      <p className="text-right">
        <span className="block text-[1.1rem] text-ink-2">Finished at</span>
        <span className="font-bib text-[2.6rem] leading-none">{formatTime(end, timezone)}</span>
      </p>
    );
  }
  return null;
}

function ClockFigure({ to, serverNow, caption }: { to: number; serverNow: number; caption: string }) {
  return (
    <p className="flex items-baseline gap-3">
      <Countdown to={to} serverNow={serverNow} className="text-6xl leading-[0.8] lg:text-[5.4rem]" />
      <span className="text-[1.3rem] font-medium text-ink-2">{caption}</span>
    </p>
  );
}

function StartLine({
  rows,
  canJoin,
  started,
}: {
  rows: StandingsPayload["standings"];
  canJoin: boolean;
  /** The hunt is already running (and waiting for its first team). */
  started: boolean;
}) {
  const teams = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Plate className="flex min-h-0 flex-1 flex-col px-5 py-5 lg:px-8 lg:py-7">
      <h2 className="flex items-baseline gap-3 font-cond text-[2.6rem] leading-tight font-extrabold">
        {started ? "Waiting for the first team" : "On the start line"}
        {teams.length > 0 ? <span className="font-bib text-[2.2rem] text-ink-2">{teams.length}</span> : null}
      </h2>
      <p className="mt-1 text-[1.4rem] text-ink-2">
        {started
          ? "The hunt is on. Scores appear here as soon as a team gets a task accepted."
          : "Scores appear here the moment the hunt starts."}
      </p>
      {teams.length === 0 ? (
        <p className="mt-8 text-[1.6rem] font-semibold">
          {canJoin ? "No teams yet. Scan the code to be the first." : "No teams yet."}
        </p>
      ) : (
        <ul className="mt-7 grid min-h-0 content-start gap-x-10 gap-y-5 overflow-hidden sm:grid-cols-2">
          {teams.map((t) => (
            <li key={t.teamId} className="flex min-w-0 items-center gap-4">
              <TeamAvatar team={t} className="lg:size-[3.2rem] lg:text-[1.9rem]" />
              <span className="min-w-0 font-cond text-2xl leading-tight font-extrabold [overflow-wrap:anywhere] lg:text-[1.9rem]">
                {t.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Plate>
  );
}

function JoinBlock({ join, large }: { join: ScreenJoin; large: boolean }) {
  return (
    <section
      aria-label="Join the hunt"
      className={cn(
        "flex shrink-0 items-center gap-6 rounded-xl border border-line bg-paper p-5",
        large && "flex-1 flex-col justify-center gap-8 p-8 text-center",
      )}
    >
      {/* QrCode brings its own white quiet zone, so it scans in Night-O too. */}
      <div
        className={cn("shrink-0 overflow-hidden rounded-md", large ? "w-[min(24rem,80%)]" : "w-[7.5rem] lg:w-[9.5rem]")}
      >
        {join.qr}
      </div>
      <div className="min-w-0">
        <p className={cn("font-cond font-extrabold", large ? "text-[2.6rem]" : "text-[1.7rem]")}>Scan to join</p>
        <p className={cn("mt-1 break-all text-ink-2", large ? "text-[1.5rem]" : "text-[1.1rem]")}>{join.display}</p>
        <p className="mt-3">
          <span className={cn("block text-ink-2", large ? "text-[1.4rem]" : "text-[1.05rem]")}>Hunt code</span>
          <span
            className={cn(
              "mt-1 block font-bib leading-none tracking-wide whitespace-nowrap",
              large ? "text-[4.5rem]" : "text-[2.8rem]",
            )}
          >
            {join.code}
          </span>
        </p>
      </div>
    </section>
  );
}
