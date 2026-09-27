"use client";

import { useEffect, useRef, useState } from "react";
import { rankMovement, rankSnapshot, type StandingRow } from "@/lib/live/types";
import { cn } from "@/lib/utils";

type Snapshot = { at: number; ranks: Record<string, number> };

const storageKey = (huntId: string) => `shp:board:${huntId}`;

function readSnapshot(huntId: string): Snapshot | null {
  try {
    const raw = window.localStorage.getItem(storageKey(huntId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    if (typeof parsed.at !== "number" || !parsed.ranks || typeof parsed.ranks !== "object") return null;
    return { at: parsed.at, ranks: parsed.ranks };
  } catch {
    return null;
  }
}

function writeSnapshot(huntId: string, rows: Pick<StandingRow, "teamId" | "rank">[]) {
  try {
    const snapshot: Snapshot = { at: Date.now(), ranks: rankSnapshot(rows) };
    window.localStorage.setItem(storageKey(huntId), JSON.stringify(snapshot));
  } catch {
    // Private mode or storage full: movement arrows are a nicety.
  }
}

/**
 * Places each team moved since this device last looked at the board.
 * The previous snapshot is read once per visit; every render of new
 * standings is saved as the baseline for the next visit.
 */
export function useRankMovement(huntId: string, rows: Pick<StandingRow, "teamId" | "rank">[], enabled = true) {
  const [baseline, setBaseline] = useState<Snapshot | null>(null);
  const readOnce = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (!readOnce.current) {
      readOnce.current = true;
      setBaseline(readSnapshot(huntId));
    }
    writeSnapshot(huntId, rows);
  }, [huntId, rows, enabled]);

  return { since: baseline?.at ?? null, moves: rankMovement(baseline?.ranks, rows) };
}

/** ▲2 / ▼1 — glyph and number, so it doesn't rely on color. */
export function Movement({ delta, className }: { delta: number | undefined; className?: string }) {
  if (!delta) return null;
  const up = delta > 0;
  const n = Math.abs(delta);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-bib text-sm leading-none",
        up ? "text-forest" : "text-danger",
        className,
      )}
    >
      <svg viewBox="0 0 10 10" aria-hidden className="size-2.5">
        <path d={up ? "M5 1.5 9 8.5H1Z" : "M5 8.5 1 1.5h8Z"} fill="currentColor" />
      </svg>
      {n}
      <span className="sr-only">{`${up ? "up" : "down"} ${n} ${n === 1 ? "place" : "places"}`}</span>
    </span>
  );
}
