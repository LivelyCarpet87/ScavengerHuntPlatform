/*
 * Shapes of the live JSON feeds (GET /api/hunts/[huntId]/standings and /feed)
 * and small pure helpers shared by the scoreboard, the big screen and the
 * gallery. Client-safe: no server imports.
 */

import type { HuntPhase } from "@/lib/hunts";

/** One row of the scoreboard. Hidden teams only ever reach staff (rank null, hidden true). */
export type StandingRow = {
  /** 1-based; equal ranks are ties. Null for hidden teams. */
  rank: number | null;
  teamId: string;
  name: string;
  emoji: string;
  /** Key into TEAM_COLORS (lib/palette.ts). */
  color: string;
  total: number;
  /** Standard tasks solved. */
  solved: number;
  /** Contests in which the team holds a scoring place. */
  placements: number;
  hidden: boolean;
};

export type StandingsPayload = {
  phase: HuntPhase;
  /** The freeze instant these standings are computed at (ISO), or null when live. */
  frozenAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  /** When the numbers were computed (ISO). */
  updatedAt: string;
  standings: StandingRow[];
};

export type FeedTeam = { id: string; name: string; emoji: string; color: string };
export type FeedTask = { id: string; code: number; title: string; kind: "media" | "answer" | "checkpoint" | "contest" };

/** A photo or video attached to an accepted submission. URLs are access-checked by /files. */
export type FeedMedia = {
  id: string;
  kind: "image" | "video";
  /** ≤480px still (for videos: the poster frame), or null for a video without a poster. */
  thumb: string | null;
  /** ≤1600px still for images, poster for videos (null when there is none). */
  display: string | null;
  /** The uploaded file itself (video playback, downloads). */
  original: string;
  width: number | null;
  height: number | null;
};

export type FeedPunch = {
  kind: "punch";
  /** Submission id. */
  id: string;
  /** When the submission was accepted (ISO); falls back to when it was sent. */
  at: string;
  team: FeedTeam;
  task: FeedTask;
  /** Points the team holds for this task (as of the viewer's cutoff); null for repeat entries. */
  points: number | null;
  /** Empty unless the gallery is open to the viewer. */
  media: FeedMedia[];
};

/** One photo or video in the gallery, with the submission it proves. */
export type GalleryItem = FeedMedia & {
  submissionId: string;
  /** When the submission was accepted (ISO). */
  at: string;
  team: FeedTeam;
  task: FeedTask;
};

export type FeedAnnouncement = {
  kind: "announcement";
  id: string;
  at: string;
  title: string | null;
  body: string;
};

export type FeedItem = FeedPunch | FeedAnnouncement;

export type FeedPayload = {
  items: FeedItem[];
  /** Whether media URLs are included (the gallery is open to the viewer). */
  galleryOpen: boolean;
  /** Freeze instant applied to score events (ISO), or null. */
  frozenAt: string | null;
};

/** True when nobody has any points or solves yet (start of a hunt). */
export function isBoardEmpty(rows: Pick<StandingRow, "total" | "solved" | "placements">[]): boolean {
  return rows.every((r) => r.total === 0 && r.solved === 0 && r.placements === 0);
}

/** Whether a row shares its rank with a neighbour. */
export function isTied(rows: Pick<StandingRow, "rank">[], index: number): boolean {
  const rank = rows[index]?.rank;
  if (rank == null) return false;
  return rows[index - 1]?.rank === rank || rows[index + 1]?.rank === rank;
}

/**
 * Places moved since a previous snapshot of ranks: positive = moved up.
 * Teams missing from the snapshot (or unranked) get no entry.
 */
export function rankMovement(
  previous: Record<string, number> | null | undefined,
  rows: Pick<StandingRow, "teamId" | "rank">[],
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!previous) return out;
  for (const row of rows) {
    const before = previous[row.teamId];
    if (row.rank == null || before == null) continue;
    const delta = before - row.rank;
    if (delta !== 0) out[row.teamId] = delta;
  }
  return out;
}

/** teamId → rank for the ranked rows, for storing a snapshot. */
export function rankSnapshot(rows: Pick<StandingRow, "teamId" | "rank">[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) if (row.rank != null) out[row.teamId] = row.rank;
  return out;
}

/** "5 tasks", "1 task, 1 contest place", "No tasks yet" */
export function describeProgress(row: Pick<StandingRow, "solved" | "placements">): string {
  const tasks = row.solved === 1 ? "1 task" : `${row.solved} tasks`;
  if (row.placements === 0) return row.solved === 0 ? "No tasks yet" : tasks;
  const places = row.placements === 1 ? "1 contest place" : `${row.placements} contest places`;
  return row.solved === 0 ? places : `${tasks}, ${places}`;
}

/** "3 photos", "1 video", "2 photos and 1 video"; an adjective goes before the first noun ("4 accepted photos"). */
export function describeMedia(items: Pick<FeedMedia, "kind">[], adjective?: string): string {
  const videos = items.filter((i) => i.kind === "video").length;
  const photos = items.length - videos;
  const a = adjective ? `${adjective} ` : "";
  const photoText = (lead: string) => `${photos} ${lead}${photos === 1 ? "photo" : "photos"}`;
  const videoText = (lead: string) => `${videos} ${lead}${videos === 1 ? "video" : "videos"}`;
  if (videos === 0) return photoText(a);
  if (photos === 0) return videoText(a);
  return `${photoText(a)} and ${videoText("")}`;
}
