"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Ordinal } from "@/components/ui/bib";
import { TeamAvatar } from "@/components/ui/team-badge";
import { formatPoints, formatTime } from "@/lib/format";
import { describeProgress, isBoardEmpty, isTied, type StandingRow } from "@/lib/live/types";
import { cn } from "@/lib/utils";
import { Podium, type PodiumEntry, TieTag, YouTag } from "./podium";
import { Movement, useRankMovement } from "./rank-movement";

/**
 * The player scoreboard: the top three on finish-line bibs, then everyone
 * else in ranked rows. The viewer's team is highlighted; when its row is off
 * screen a bar above the tab bar keeps "You: 5th, 640" in view. Arrows show
 * places gained or lost since this device last looked.
 */
export function ScoreboardBoard({
  huntId,
  timezone,
  rows,
  viewerTeamId,
}: {
  huntId: string;
  timezone: string;
  /** Visible teams in rank order, then (staff only) hidden teams. */
  rows: StandingRow[];
  viewerTeamId: string | null;
}) {
  // Stable per server render, so the movement snapshot is only saved when the standings change.
  const ranked = useMemo(() => rows.filter((r) => !r.hidden), [rows]);
  const hidden = rows.filter((r) => r.hidden);
  const empty = isBoardEmpty(ranked);
  const { since, moves } = useRankMovement(huntId, ranked, !empty);
  const [youEl, setYouEl] = useState<HTMLElement | null>(null);

  const entry = (row: StandingRow, i: number): PodiumEntry => ({
    row,
    tied: isTied(ranked, i),
    you: row.teamId === viewerTeamId,
    movement: <Movement delta={moves[row.teamId]} />,
  });
  const podium = empty ? [] : ranked.slice(0, 3).map(entry);
  const rest = empty ? ranked : ranked.slice(3);
  const offset = podium.length;
  const you = ranked.find((r) => r.teamId === viewerTeamId) ?? null;
  const anyMoves = Object.keys(moves).length > 0;

  return (
    <div className="flex flex-col gap-6">
      {empty ? (
        <p className="rounded-lg bg-mist px-4 py-3 text-ink-2">
          No points yet. The first team to get a task accepted takes the lead.
        </p>
      ) : null}

      {podium.length > 0 ? <Podium entries={podium} youRef={setYouEl} /> : null}

      {rest.length > 0 ? (
        <section aria-label={podium.length > 0 ? "Everyone else" : "Teams"}>
          <div
            aria-hidden
            className="flex items-center gap-3 border-b border-line px-2 pb-2 text-sm font-medium text-ink-2"
          >
            <span className="w-9 text-center">Place</span>
            <span className="flex-1">Team</span>
            <span>Points</span>
          </div>
          <ol className="divide-y divide-line">
            {rest.map((row, j) => {
              const i = offset + j;
              const isYou = row.teamId === viewerTeamId;
              return (
                <li
                  key={row.teamId}
                  ref={isYou ? setYouEl : undefined}
                  className={cn("flex min-h-16 items-center gap-3 px-2 py-2.5", isYou && "bg-sun-wash")}
                >
                  <div className="flex w-9 shrink-0 flex-col items-center">
                    <span className="font-bib text-2xl leading-none">
                      {empty || row.rank == null ? (
                        <>
                          <span aria-hidden>–</span>
                          <span className="sr-only">No place yet</span>
                        </>
                      ) : (
                        <>
                          <span className="sr-only">Place </span>
                          {row.rank}
                        </>
                      )}
                    </span>
                    {!empty && isTied(ranked, i) ? <TieTag className="mt-0.5 leading-none" /> : null}
                  </div>
                  <TeamAvatar team={row} />
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-semibold">{row.name}</span>
                      {isYou ? <YouTag /> : null}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-sm text-ink-2">
                      <span>{describeProgress(row)}</span>
                      <Movement delta={moves[row.teamId]} />
                    </p>
                  </div>
                  <span className="font-bib text-2xl tabular-nums">
                    {formatPoints(row.total)}
                    <span className="sr-only"> points</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {anyMoves && since ? (
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <span aria-hidden>
            <Movement delta={1} className="text-ink-3" />
          </span>
          <span>
            Arrows show places gained or lost since you last looked at <time>{formatTime(since, timezone)}</time>.
          </span>
        </p>
      ) : null}

      {hidden.length > 0 ? (
        <section aria-labelledby="hidden-teams" className="rounded-lg bg-mist px-4 py-3">
          <h2 id="hidden-teams" className="font-semibold">
            Hidden from players
          </h2>
          <p className="text-sm text-ink-2">
            Only staff see these teams. They score, but don’t take a place or change other teams’ points.
          </p>
          <ul className="mt-2 divide-y divide-line">
            {hidden.map((row) => (
              <li key={row.teamId} className="flex items-center gap-3 py-2.5">
                <TeamAvatar team={row} size="sm" />
                <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
                <span className="font-bib text-xl tabular-nums text-ink-2">
                  {formatPoints(row.total)}
                  <span className="sr-only"> points</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {you && !empty ? <YouBar target={youEl} row={you} /> : null}
    </div>
  );
}

/** "You: 5th, 640" pinned above the tab bar while the team's own row is off screen. */
function YouBar({ target, row }: { target: HTMLElement | null; row: StandingRow }) {
  const [where, setWhere] = useState<"visible" | "above" | "below">("visible");

  useEffect(() => {
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setWhere("visible");
        else setWhere(e.boundingClientRect.top < 0 ? "above" : "below");
      },
      // Leave room for the sticky header on top and the tab bar below.
      { rootMargin: "-56px 0px -72px 0px", threshold: 0.6 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [target]);

  if (where === "visible" || row.rank == null) return null;
  const Icon = where === "above" ? ArrowUp : ArrowDown;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 md:bottom-6">
      <button
        type="button"
        onClick={() =>
          target?.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
            block: "center",
          })
        }
        className="pointer-events-auto flex h-12 w-full max-w-sm items-center gap-3 rounded-lg bg-sun-wash pr-2 pl-4 text-left text-ink shadow-pop animate-pop"
      >
        <span className="font-semibold">You</span>
        <Ordinal n={row.rank} className="text-2xl leading-none" />
        <span className="flex items-baseline gap-1">
          <span className="font-bib text-2xl leading-none">{formatPoints(row.total)}</span>
          <span className="text-sm text-ink-2">points</span>
        </span>
        <span className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-sun-fg">
          Show row
          <Icon aria-hidden className="size-4" />
        </span>
      </button>
    </div>
  );
}
