import "server-only";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { type Hunt, huntStaff, hunts, teams, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { type HuntPhase, huntPhase } from "@/lib/hunts";

/*
 * Read models for the platform admin area (/admin). Every query here spans
 * all hunts on purpose — only call these behind requireAdmin().
 */

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  createdAt: Date;
  /** Hunts where the account has an explicit staff role. */
  huntsStaffed: number;
  /** Hunts where this account is the only owner (deleting it leaves them to the admins). */
  soleOwnerOf: { id: string; name: string }[];
};

export async function listUsersForAdmin(): Promise<AdminUserRow[]> {
  const [rows, owners] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        isAdmin: users.isAdmin,
        createdAt: users.createdAt,
        huntsStaffed: count(huntStaff.huntId),
      })
      .from(users)
      .leftJoin(huntStaff, eq(huntStaff.userId, users.id))
      .groupBy(users.id)
      .orderBy(desc(users.createdAt)),
    db
      .select({ huntId: huntStaff.huntId, userId: huntStaff.userId, huntName: hunts.name })
      .from(huntStaff)
      .innerJoin(hunts, eq(hunts.id, huntStaff.huntId))
      .where(eq(huntStaff.role, "owner")),
  ]);

  const ownersByHunt = new Map<string, { userId: string; huntName: string }[]>();
  for (const o of owners) {
    const list = ownersByHunt.get(o.huntId) ?? [];
    list.push({ userId: o.userId, huntName: o.huntName });
    ownersByHunt.set(o.huntId, list);
  }
  const soleOwner = new Map<string, { id: string; name: string }[]>();
  for (const [huntId, list] of ownersByHunt) {
    if (list.length !== 1) continue;
    const [only] = list;
    const hunts = soleOwner.get(only.userId) ?? [];
    hunts.push({ id: huntId, name: only.huntName });
    soleOwner.set(only.userId, hunts);
  }

  return rows.map((r) => ({ ...r, soleOwnerOf: soleOwner.get(r.id) ?? [] }));
}

export type AdminHuntRow = Pick<Hunt, "id" | "name" | "slug" | "status" | "startsAt" | "endsAt" | "createdAt"> & {
  phase: HuntPhase;
  owners: string[];
  /** Teams on the scoreboard (hidden staff test teams excluded). */
  teamCount: number;
};

const PHASE_ORDER: Record<HuntPhase, number> = { live: 0, upcoming: 1, draft: 2, ended: 3, archived: 4 };

/** Every hunt on the platform, running ones first. */
export async function listHuntsForAdmin(now = new Date()): Promise<AdminHuntRow[]> {
  const [huntRows, teamCounts, ownerRows, creators] = await Promise.all([
    db
      .select({
        id: hunts.id,
        name: hunts.name,
        slug: hunts.slug,
        status: hunts.status,
        startsAt: hunts.startsAt,
        endsAt: hunts.endsAt,
        createdAt: hunts.createdAt,
        createdBy: hunts.createdBy,
      })
      .from(hunts),
    db.select({ huntId: teams.huntId, n: count() }).from(teams).where(eq(teams.hidden, false)).groupBy(teams.huntId),
    db
      .select({ huntId: huntStaff.huntId, name: users.name })
      .from(huntStaff)
      .innerJoin(users, eq(users.id, huntStaff.userId))
      .where(eq(huntStaff.role, "owner"))
      .orderBy(huntStaff.createdAt),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);

  const teamsByHunt = new Map(teamCounts.map((t) => [t.huntId, t.n]));
  const creatorName = new Map(creators.map((c) => [c.id, c.name]));
  const ownersByHunt = new Map<string, string[]>();
  for (const o of ownerRows) ownersByHunt.set(o.huntId, [...(ownersByHunt.get(o.huntId) ?? []), o.name]);

  return huntRows
    .map(({ createdBy, ...h }) => {
      const owners = ownersByHunt.get(h.id) ?? [];
      const fallback = createdBy ? creatorName.get(createdBy) : undefined;
      return {
        ...h,
        phase: huntPhase(h, now),
        owners: owners.length > 0 ? owners : fallback ? [fallback] : [],
        teamCount: teamsByHunt.get(h.id) ?? 0,
      };
    })
    .sort(
      (a, b) =>
        PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] ||
        (b.startsAt?.getTime() ?? b.createdAt.getTime()) - (a.startsAt?.getTime() ?? a.createdAt.getTime()),
    );
}

/** What the server is running with, for the admin settings page. Never includes secrets. */
export function serverConfig() {
  return {
    appName: env.appName,
    appUrl: env.appUrl,
    dataDir: env.dataDir,
    remoteDatabase: !env.databaseUrl.startsWith("file:"),
    maxUploadMb: Math.round(env.maxUploadBytes / 1024 / 1024),
    cookieSecure: env.cookieSecure,
    vapidFromEnv: !!(env.vapid.publicKey && env.vapid.privateKey),
    vapidSubject: env.vapid.subject,
    /** Unset, or still the example address from the docs. */
    vapidSubjectIsDefault: !process.env.VAPID_SUBJECT || /@example\.(com|org|net)\b/i.test(env.vapid.subject),
  };
}
