import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/db";
import { type Hunt, hunts, type Task } from "@/lib/db/schema";

export const getHuntById = cache(async (id: string): Promise<Hunt | null> => {
  return (await db.select().from(hunts).where(eq(hunts.id, id)).get()) ?? null;
});

export const getHuntBySlug = cache(async (slug: string): Promise<Hunt | null> => {
  return (await db.select().from(hunts).where(eq(hunts.slug, slug)).get()) ?? null;
});

export const getHuntByJoinCode = cache(async (code: string): Promise<Hunt | null> => {
  return (await db.select().from(hunts).where(eq(hunts.joinCode, code)).get()) ?? null;
});

/**
 * Where a hunt is in its lifecycle, from a player's point of view.
 *   draft     – not published; only staff can see it
 *   archived  – finished and filed away; read-only
 *   upcoming  – published, before startsAt (teams can register, tasks hidden)
 *   live      – published and running
 *   ended     – published, after endsAt (read-only results)
 */
export type HuntPhase = "draft" | "archived" | "upcoming" | "live" | "ended";

export function huntPhase(hunt: Pick<Hunt, "status" | "startsAt" | "endsAt">, now = new Date()): HuntPhase {
  if (hunt.status === "draft") return "draft";
  if (hunt.status === "archived") return "archived";
  if (hunt.startsAt && now < hunt.startsAt) return "upcoming";
  if (hunt.endsAt && now >= hunt.endsAt) return "ended";
  return "live";
}

/** Whether players can see a task right now (staff always can). */
export function isTaskVisible(task: Pick<Task, "hidden" | "unlockAt">, now = new Date()): boolean {
  if (task.hidden) return false;
  if (task.unlockAt && now < task.unlockAt) return false;
  return true;
}

/** Whether a team may submit to a task right now. Returns a reason when not. */
export function submissionBlockReason(
  hunt: Pick<Hunt, "status" | "startsAt" | "endsAt">,
  task: Pick<Task, "hidden" | "unlockAt" | "lockAt">,
  now = new Date(),
): string | null {
  const phase = huntPhase(hunt, now);
  if (phase === "upcoming") return "The hunt hasn’t started yet.";
  if (phase === "ended" || phase === "archived") return "The hunt is over — submissions are closed.";
  if (phase === "draft") return "This hunt isn’t published yet.";
  if (!isTaskVisible(task, now)) return "This task isn’t available yet.";
  if (task.lockAt && now >= task.lockAt) return "This task is closed.";
  return null;
}

export type ScoreboardViewer = { isStaff: boolean; isPlayer: boolean };

export function canViewScoreboard(hunt: Pick<Hunt, "scoreboardVisibility">, viewer: ScoreboardViewer): boolean {
  if (viewer.isStaff) return true;
  if (hunt.scoreboardVisibility === "public") return true;
  if (hunt.scoreboardVisibility === "players") return viewer.isPlayer;
  return false;
}

/**
 * The moment non-staff standings are computed "as of". Null means live.
 * Staff always see live standings. Once the hunt ends the freeze lifts.
 */
export function scoreboardCutoff(
  hunt: Pick<Hunt, "freezeAt" | "endsAt" | "status" | "startsAt">,
  viewer: ScoreboardViewer,
  now = new Date(),
): Date | null {
  if (viewer.isStaff || !hunt.freezeAt) return null;
  if (now < hunt.freezeAt) return null;
  const phase = huntPhase(hunt, now);
  if (phase === "ended" || phase === "archived") return null;
  return hunt.freezeAt;
}

/**
 * Whether the viewer may browse accepted photos/videos from other teams
 * (gallery, big-screen photo wall). Participants can when the gallery is
 * open; the public can too when the scoreboard is public.
 */
export function canViewGallery(
  hunt: Pick<Hunt, "galleryMode" | "scoreboardVisibility" | "status" | "startsAt" | "endsAt">,
  viewer: ScoreboardViewer,
  now = new Date(),
): boolean {
  if (viewer.isStaff) return true;
  if (hunt.galleryMode === "off" || hunt.status === "draft") return false;
  if (!viewer.isPlayer && hunt.scoreboardVisibility !== "public") return false;
  if (hunt.galleryMode === "live") return true;
  const phase = huntPhase(hunt, now);
  return phase === "ended" || phase === "archived";
}
