"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPacer, type Pacer } from "@/components/live/pacer";
import { paceFor, requestRefresh } from "@/components/live/refresh";
import { useHuntEvents } from "@/components/live/use-hunt-events";
import type { StandingRow, StandingsPayload } from "@/lib/live/types";
import type { HuntEventType } from "@/lib/realtime/bus";

const ON: HuntEventType[] = ["scores.changed", "teams.changed", "submission.judged"];

/**
 * The scoreboard's rows, kept live. Score and team events fetch the
 * standings JSON (small, and computed once per change for everyone) instead
 * of re-rendering the page: the viewer's own team and hunt-wide changes
 * within half a second, other teams' activity at most every 4 s with jitter,
 * hidden tabs once they're looked at again. A server render (the hunt
 * changed, this team's own decision) brings fresh rows too; whichever
 * standings are newer win.
 */
export function useLiveStandings(huntId: string, rows: StandingRow[], updatedAt: string): StandingRow[] {
  const router = useRouter();
  const [live, setLive] = useState({ rows, updatedAt });
  const [fromServer, setFromServer] = useState(rows);
  if (fromServer !== rows) {
    setFromServer(rows);
    if (updatedAt >= live.updatedAt) setLive({ rows, updatedAt });
  }
  const pacer = useRef<Pacer | null>(null);
  const latest = useRef(0);

  const load = useEffectEvent(async () => {
    const mine = ++latest.current;
    try {
      const res = await fetch(`/api/hunts/${huntId}/standings`, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      // The board was closed to this viewer: let the page say so.
      if (res.status === 404) return requestRefresh(router);
      if (!res.ok) return;
      const payload = (await res.json()) as StandingsPayload;
      if (mine !== latest.current) return;
      setLive((cur) =>
        payload.updatedAt >= cur.updatedAt ? { rows: payload.standings, updatedAt: payload.updatedAt } : cur,
      );
    } catch {
      // Offline: the stream replays what was missed when the phone reconnects.
    }
  });

  useEffect(() => {
    const p = createPacer(() => void load(), { quietMs: 400, maxWaitMs: 2000, gapMs: 4000, jitterMs: 2000 });
    pacer.current = p;
    const onVisibility = () => (document.visibilityState === "hidden" ? p.hide() : p.show());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      p.cancel();
      pacer.current = null;
    };
  }, []);

  useHuntEvents(
    huntId,
    (e) => {
      if (ON.includes(e.type)) pacer.current?.ask(paceFor(e));
    },
    { onResync: () => pacer.current?.ask() },
  );

  return live.rows;
}
