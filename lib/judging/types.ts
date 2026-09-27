import type { ContestRank, SubmissionStatus, TaskKind } from "@/lib/db/schema";
import type { CompactScoring } from "./what-if";

/*
 * Serializable shapes the judging screens pass from the server to client
 * components. Times are epoch milliseconds.
 */

export type MediaFile = {
  id: string;
  kind: "image" | "video" | "audio" | "document";
  mime: string;
  width: number | null;
  height: number | null;
  size: number;
  name: string | null;
  thumb: string;
  display: string;
  original: string;
  /** Video poster frame, when the device sent one. */
  poster: string | null;
  /** Direct download link for the original. */
  download: string;
};

/** A task as judging screens need it. The description is rendered on the server (it's Markdown). */
export type JudgeTask = {
  id: string;
  code: number;
  title: string;
  kind: TaskKind;
  /** "Photo", "Video", "Answer", "Contest" … */
  kindLabel: string;
  category: string | null;
  answers: string[];
  answerMatch: "loose" | "exact" | "regex";
  /** describeScoring() sentence. */
  scoringText: string;
  scoring: "fixed" | "rarity" | "race";
  contestUnit: string | null;
  contestRank: ContestRank;
  contestPlaces: number;
  /** Contest entries need a measured value before they can be approved. */
  needsValue: boolean;
  autoApprove: boolean;
  hidden: boolean;
};

export type JudgeTeam = { id: string; name: string; emoji: string; color: string; hidden: boolean };

export type Claim = { userId: string; name: string; at: number };

/** One of the team's other submissions for the same task. */
export type HistoryEntry = {
  id: string;
  status: SubmissionStatus;
  autoJudged: boolean;
  createdAt: number;
  judgedAt: number | null;
  judgedBy: string | null;
  text: string | null;
  feedback: string | null;
  contestValue: number | null;
  pointsOverride: number | null;
  thumb: string | null;
};

export type QueueItem = {
  id: string;
  taskId: string;
  teamId: string;
  playerName: string | null;
  text: string | null;
  createdAt: number;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  files: MediaFile[];
  claim: Claim | null;
  /** Newest first. */
  history: HistoryEntry[];
};

export type RecentDecision = {
  id: string;
  status: SubmissionStatus;
  teamId: string;
  taskId: string;
  judgedAt: number;
  judgedBy: string;
  byMe: boolean;
  feedback: string | null;
  /** What the team holds for the task now. */
  points: number;
  thumb: string | null;
};

/** What the judge has typed for a submission (kept per submission while moving around the queue). */
export type Draft = {
  feedback: string;
  /** Raw text of the "award different points" field; null while it's closed. */
  override: string | null;
  /** Raw text of the measured value field. */
  value: string;
};

export const EMPTY_DRAFT: Draft = { feedback: "", override: null, value: "" };

export type JudgeResult =
  | { ok: true; message: string; status: SubmissionStatus; points: number; judgedAt: number | null }
  | {
      ok: false;
      error: string;
      /** The submission changed or disappeared since it was loaded (someone else decided). */
      stale?: boolean;
      /** Which input to point at. */
      field?: "contestValue" | "pointsOverride" | "feedback";
      /** The caller isn't on the hunt's staff anymore (removed, signed out, or the hunt is gone). */
      lostAccess?: boolean;
    };

export type ClaimResult =
  | { ok: true; claimed: true }
  | { ok: true; claimed: false; judged: true }
  | { ok: true; claimed: false; judged: false; by: Claim }
  | { ok: false; error: string; lostAccess?: boolean };

/** Filters and page size the judging queue was loaded with (from the URL). */
export type QueueQuery = {
  task: string | null;
  team: string | null;
  kind: TaskKind | null;
  /** How many of the oldest matching submissions to load. */
  limit: number;
};

/** Waiting submissions in the whole queue, whatever is loaded. */
export type QueueCounts = {
  total: number;
  /** When the oldest waiting submission was sent. */
  oldestAt: number | null;
  byTask: Record<string, number>;
  byTeam: Record<string, number>;
  byKind: Partial<Record<TaskKind, number>>;
  /** Waiting submissions that match the query's filters. */
  matching: number;
};

/**
 * What the judging queue renders, loaded by lib/judging/queue.ts. It's sent
 * again on every refresh, so it holds one page of the queue rather than all of it.
 */
export type JudgeQueueData = {
  /** The oldest `query.limit` waiting submissions matching the filters (plus the one open in the URL), oldest first. */
  items: QueueItem[];
  counts: QueueCounts;
  query: QueueQuery;
  /** The submission the URL asked for (it's in `items` if it's still waiting). */
  openId: string | null;
  tasks: Record<string, JudgeTask>;
  teams: Record<string, JudgeTeam>;
  /** Per task with a loaded submission: what approving would be worth. */
  scoring: Record<string, CompactScoring>;
  recent: RecentDecision[];
};
