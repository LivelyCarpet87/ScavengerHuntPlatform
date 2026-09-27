"use client";

import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TeamAvatar } from "@/components/ui/team-badge";
import { formatPoints, formatSigned } from "@/lib/format";
import { describeProgress, isTied, type StandingRow } from "@/lib/live/types";
import { teamColorHex } from "@/lib/palette";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;
const PAGE_MS = 12_000;
const FLIP_MS = 600;
/** How long "▲2" and "+120" stay next to a team after it moves or scores. */
const CHANGE_MS = 45_000;

type Change = { rank: number; points: number; at: number };

/** Rank and points changes between consecutive updates, kept for a while so the room can notice them. */
function useRecentChanges(rows: StandingRow[]): Record<string, Change> {
  const previous = useRef<Map<string, StandingRow> | null>(null);
  const [changes, setChanges] = useState<Record<string, Change>>({});

  useEffect(() => {
    const before = previous.current;
    previous.current = new Map(rows.map((r) => [r.teamId, r]));
    if (!before) return;
    const now = Date.now();
    const fresh: Record<string, Change> = {};
    for (const row of rows) {
      const old = before.get(row.teamId);
      if (!old) continue;
      const rank = old.rank != null && row.rank != null ? old.rank - row.rank : 0;
      const points = row.total - old.total;
      if (rank !== 0 || points !== 0) fresh[row.teamId] = { rank, points, at: now };
    }
    if (Object.keys(fresh).length > 0) setChanges((c) => ({ ...c, ...fresh }));
  }, [rows]);

  useEffect(() => {
    const ids = Object.keys(changes);
    if (ids.length === 0) return;
    const next = Math.min(...ids.map((id) => changes[id].at)) + CHANGE_MS - Date.now();
    const t = setTimeout(
      () => {
        const now = Date.now();
        setChanges((c) => Object.fromEntries(Object.entries(c).filter(([, v]) => now - v.at < CHANGE_MS)));
      },
      Math.max(250, next),
    );
    return () => clearTimeout(t);
  }, [changes]);

  return changes;
}

/**
 * Standings for the projector. Top ten, paging through the rest every 12 s;
 * when an update reorders teams, rows slide to their new places (FLIP) and
 * the change stays marked for a while. Reduced motion: rows jump.
 */
export function ScreenStandings({ rows, empty }: { rows: StandingRow[]; empty: boolean }) {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const [page, setPage] = useState(0);
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const changes = useRecentChanges(rows);
  const max = Math.max(1, ...rows.map((r) => r.total));
  const comfy = rows.length <= 7;

  useEffect(() => {
    if (pages <= 1) return;
    const t = setInterval(() => setPage((p) => (p + 1) % pages), PAGE_MS);
    return () => clearInterval(t);
  }, [pages]);

  // FLIP: remember where each row sits, and after an update animate it from
  // there to its new place. Positions are layout offsets inside the list
  // (offsetTop ignores running transforms), and they are re-read whenever
  // the list changes size — fonts arriving, the window going full screen —
  // so only rows that really changed places slide.
  const list = useRef<HTMLOListElement>(null);
  const els = useRef(new Map<string, HTMLLIElement>());
  const tops = useRef(new Map<string, number>());
  const order = visible.map((r) => r.teamId).join(",");
  const measure = useCallback(() => {
    const next = new Map<string, number>();
    for (const [id, el] of els.current) next.set(id, el.offsetTop);
    return next;
  }, []);

  useEffect(() => {
    const box = list.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      tops.current = measure();
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [measure]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `order` is the trigger; positions are read from the DOM
  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const firstRun = tops.current.size === 0;
    const next = measure();
    if (!reduce && !firstRun) {
      for (const [id, el] of els.current) {
        const top = next.get(id) ?? 0;
        const before = tops.current.get(id);
        if (before === undefined) {
          el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: "ease-out" });
        } else if (Math.abs(before - top) > 1) {
          // A team climbing the board passes over the rows it overtakes.
          if (before > top) el.style.zIndex = "1";
          const slide = el.animate([{ transform: `translateY(${before - top}px)` }, { transform: "translateY(0)" }], {
            duration: FLIP_MS,
            easing: "cubic-bezier(0.2, 0.85, 0.25, 1)",
          });
          const settle = () => {
            el.style.zIndex = "";
          };
          slide.onfinish = settle;
          slide.oncancel = settle;
        }
      }
    }
    tops.current = next;
  }, [order, measure]);

  return (
    <section aria-label="Standings" className="flex min-h-0 flex-1 flex-col">
      <ol
        ref={list}
        // On the projector every row gets an equal share of the height; phones just stack.
        className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] divide-y divide-line lg:[grid-template-rows:repeat(var(--slots),minmax(0,1fr))]"
        style={{ "--slots": Math.max(visible.length, comfy ? 6 : PAGE_SIZE) } as CSSProperties}
      >
        {visible.map((row) => {
          const i = rows.indexOf(row);
          const change = changes[row.teamId];
          return (
            <li
              key={row.teamId}
              ref={(el) => {
                if (!el) return;
                els.current.set(row.teamId, el);
                return () => {
                  els.current.delete(row.teamId);
                };
              }}
              className="relative flex min-h-0 min-w-0 items-center gap-3 bg-paper px-1 py-3 lg:gap-[1.1rem] lg:px-2 lg:py-0"
            >
              <span
                className={cn(
                  "w-[3.2ch] shrink-0 text-right font-bib text-3xl leading-none tabular-nums",
                  comfy ? "lg:text-[3.4rem]" : "lg:text-[2.6rem]",
                )}
              >
                {empty ? "–" : row.rank}
              </span>
              <TeamAvatar
                team={row}
                className={comfy ? "lg:size-[3.6rem] lg:text-[2.1rem]" : "lg:size-[2.9rem] lg:text-[1.7rem]"}
              />
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-baseline gap-3">
                  <span
                    className={cn(
                      "truncate font-cond text-xl leading-tight font-extrabold tracking-tight",
                      comfy ? "lg:text-[2.5rem]" : "lg:text-[2rem]",
                    )}
                  >
                    {row.name}
                  </span>
                  {!empty && isTied(rows, i) ? (
                    <span className="text-sm font-medium text-ink-3 lg:text-[1rem]">tie</span>
                  ) : null}
                  {change && change.rank !== 0 ? <RankChange delta={change.rank} /> : null}
                  {change && change.points !== 0 ? (
                    <span
                      className={cn(
                        "shrink-0 font-bib text-lg leading-none lg:text-[1.6rem]",
                        change.points > 0 ? "text-forest" : "text-danger",
                      )}
                    >
                      {formatSigned(change.points)}
                      <span className="sr-only"> points</span>
                    </span>
                  ) : null}
                </p>
                <div className="mt-2 flex items-center gap-4">
                  {/* The race so far: each team's points as a share of the leader's. */}
                  <span aria-hidden className="h-[0.35rem] min-w-0 flex-1 overflow-hidden rounded-full bg-mist-2">
                    <span
                      className="block h-full rounded-full transition-[width] duration-700 ease-out"
                      style={{
                        width: `${Math.max(0, Math.min(100, (row.total / max) * 100))}%`,
                        background: teamColorHex(row.color),
                      }}
                    />
                  </span>
                  {/* Fixed width, so every track is the same length and the bars compare. */}
                  <span className="hidden w-[13rem] shrink-0 truncate text-[1rem] text-ink-2 lg:block">
                    {describeProgress(row)}
                  </span>
                </div>
              </div>
              <span
                className={cn(
                  // Fixed width keeps every row's track the same length.
                  "w-[5ch] shrink-0 text-right font-bib text-3xl leading-none tabular-nums",
                  comfy ? "lg:text-[3.4rem]" : "lg:text-[2.6rem]",
                )}
              >
                {formatPoints(row.total)}
              </span>
            </li>
          );
        })}
      </ol>
      {pages > 1 ? <PageIndicator page={current} pages={pages} total={rows.length} /> : null}
    </section>
  );
}

function RankChange({ delta }: { delta: number }) {
  const up = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-bib text-base leading-none lg:text-[1.4rem]",
        up ? "text-forest" : "text-danger",
      )}
    >
      <svg viewBox="0 0 10 10" aria-hidden className="size-[0.9rem]">
        <path d={up ? "M5 1.5 9 8.5H1Z" : "M5 8.5 1 1.5h8Z"} fill="currentColor" />
      </svg>
      {Math.abs(delta)}
      <span className="sr-only">{up ? " places up" : " places down"}</span>
    </span>
  );
}

function PageIndicator({ page, pages, total }: { page: number; pages: number; total: number }) {
  const from = page * PAGE_SIZE + 1;
  const to = Math.min(total, from + PAGE_SIZE - 1);
  return (
    <div className="flex items-center gap-4 pt-3 text-[1rem] text-ink-2">
      <span>
        Places <span className="font-bib text-[1.2rem] text-ink">{from}</span>–
        <span className="font-bib text-[1.2rem] text-ink">{to}</span> of {total}
      </span>
      <span className="flex gap-1.5" aria-hidden>
        {Array.from({ length: pages }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: one dot per page
            key={i}
            className={cn("h-[0.4rem] rounded-full", i === page ? "w-8 bg-accent" : "w-[0.4rem] bg-line-strong")}
          />
        ))}
      </span>
    </div>
  );
}
