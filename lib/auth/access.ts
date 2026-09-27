import "server-only";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { huntStaff, type Player, players, type StaffRole, type Team, teams, type User } from "@/lib/db/schema";
import { getHuntById, getHuntBySlug } from "@/lib/hunts";
import { getSession } from "./session";

/*
 * Access rules
 * ------------
 * Staff:   platform admins act as owner of every hunt. Otherwise hunt_staff.role:
 *          judge < organizer < owner.
 *            judge      – judging queue, submissions, teams & scoreboard (read)
 *            organizer  – everything except deleting the hunt and managing owners
 *            owner      – everything
 * Players: a player row links this device's session to a team in one hunt.
 */

const ROLE_RANK: Record<StaffRole, number> = { judge: 1, organizer: 2, owner: 3 };

export function roleAtLeast(role: StaffRole | null | undefined, min: StaffRole): boolean {
  return !!role && ROLE_RANK[role] >= ROLE_RANK[min];
}

/** The viewer's staff role on a hunt, or null. Memoized per request. */
export const getStaffRole = cache(async (huntId: string): Promise<StaffRole | null> => {
  const s = await getSession();
  if (!s?.user) return null;
  if (s.user.isAdmin) return "owner";
  const row = await db
    .select({ role: huntStaff.role })
    .from(huntStaff)
    .where(and(eq(huntStaff.huntId, huntId), eq(huntStaff.userId, s.user.id)))
    .get();
  return row?.role ?? null;
});

/** Page/action guard for signed-in staff users. Redirects to /login otherwise. */
export async function requireUser(next?: string): Promise<User> {
  const s = await getSession();
  if (!s?.user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return s.user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser("/admin");
  if (!user.isAdmin) notFound();
  return user;
}

/**
 * Page/action guard for hunt staff. Signed-out visitors go to /login; signed-in
 * users without the role get a 404 (we don't reveal that the hunt exists).
 */
export async function requireStaff(huntId: string, min: StaffRole = "judge") {
  const user = await requireUser(`/manage/${huntId}`);
  const hunt = await getHuntById(huntId);
  if (!hunt) notFound();
  const role = await getStaffRole(huntId);
  if (!roleAtLeast(role, min) || !role) notFound();
  return { user, hunt, role };
}

export type PlayerContext = { player: Player; team: Team };

/** This device's player identity in a hunt, or null. Memoized per request. */
export const getPlayer = cache(async (huntId: string): Promise<PlayerContext | null> => {
  const s = await getSession();
  if (!s) return null;
  const row = await db
    .select({ player: players, team: teams })
    .from(players)
    .innerJoin(teams, eq(teams.id, players.teamId))
    .where(and(eq(players.huntId, huntId), eq(players.sessionId, s.session.id)))
    .get();
  return row ?? null;
});

/**
 * Resolves /h/[slug] for players: 404s for unknown or draft hunts (unless the
 * viewer is staff), and returns the viewer's player context if they joined.
 */
export async function getPlayerHunt(slug: string) {
  const hunt = await getHuntBySlug(slug);
  if (!hunt) notFound();
  const role = await getStaffRole(hunt.id);
  if (hunt.status === "draft" && !role) notFound();
  const me = await getPlayer(hunt.id);
  return { hunt, me, staffRole: role };
}

/** Like getPlayerHunt, but sends visitors who haven't joined to the hunt's join page. */
export async function requirePlayer(slug: string) {
  const ctx = await getPlayerHunt(slug);
  if (!ctx.me) redirect(`/h/${slug}`);
  return { ...ctx, me: ctx.me };
}
