import "server-only";
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { type Db, db } from "@/lib/db";
import { type Hunt, huntStaff, type Invite, invites, type StaffRole, users } from "@/lib/db/schema";
import { getHuntById } from "@/lib/hunts";
import { newToken } from "@/lib/ids";
import { type InviteStatus, inviteStatus, isPlausibleToken, upgradedRole } from "./rules";

/*
 * Invite links (the `invites` table). The token is the row id and the whole
 * secret: /invite/<token>.
 *
 *   hunt invite      huntId set   — accepting grants `role` on that hunt (upgrade only)
 *   platform invite  huntId null  — lets someone create an organizer account while
 *                                   sign-up is invite-only
 *
 * Hunt invites are created from the hunt's staff settings; platform invites
 * from /admin/settings. Both are accepted through /invite/[token] or
 * /signup?invite=<token>.
 */

type Tx = Pick<Db, "select" | "insert" | "update">;

export type InviteView = {
  invite: Invite;
  status: InviteStatus;
  /** The hunt for hunt invites, null for platform invites. */
  hunt: Hunt | null;
  inviterName: string | null;
};

/** Relative link people open to accept an invite. Prefix with baseUrl() for sharing. */
export function invitePath(token: string): string {
  return `/invite/${token}`;
}

/** Loads an invite with its hunt and inviter, or null when the token matches nothing. */
export async function getInviteView(token: string): Promise<InviteView | null> {
  if (!isPlausibleToken(token)) return null;
  const row = await db
    .select({ invite: invites, inviterName: users.name })
    .from(invites)
    .leftJoin(users, eq(users.id, invites.createdBy))
    .where(eq(invites.id, token))
    .get();
  if (!row) return null;
  const hunt = row.invite.huntId ? await getHuntById(row.invite.huntId) : null;
  if (row.invite.huntId && !hunt) return null;
  return { invite: row.invite, status: inviteStatus(row.invite), hunt, inviterName: row.inviterName };
}

/**
 * Uses up one use of an invite, atomically. Returns false when the invite was
 * revoked, expired or used up in the meantime. Call inside a write transaction
 * together with whatever the invite grants.
 */
export async function consumeInvite(tx: Tx, inviteId: string, now = new Date()): Promise<boolean> {
  const updated = await tx
    .update(invites)
    .set({ uses: sql`${invites.uses} + 1` })
    .where(
      and(
        eq(invites.id, inviteId),
        isNull(invites.revokedAt),
        or(isNull(invites.expiresAt), gt(invites.expiresAt, now)),
        or(isNull(invites.maxUses), lt(invites.uses, invites.maxUses)),
      ),
    )
    .returning({ id: invites.id });
  return updated.length === 1;
}

/** The user's current role on a hunt (explicit membership only; admins aren't listed). */
export async function getMembershipRole(tx: Pick<Db, "select">, huntId: string, userId: string) {
  const row = await tx
    .select({ role: huntStaff.role })
    .from(huntStaff)
    .where(and(eq(huntStaff.huntId, huntId), eq(huntStaff.userId, userId)))
    .get();
  return row?.role ?? null;
}

/** Writes a hunt role for a user, creating or upgrading the membership. */
async function writeRole(tx: Tx, huntId: string, userId: string, role: StaffRole, exists: boolean) {
  if (exists) {
    await tx
      .update(huntStaff)
      .set({ role })
      .where(and(eq(huntStaff.huntId, huntId), eq(huntStaff.userId, userId)));
  } else {
    await tx.insert(huntStaff).values({ huntId, userId, role });
  }
}

export type AcceptOutcome =
  | { outcome: "accepted"; role: StaffRole; previous: StaffRole | null }
  | { outcome: "already"; role: StaffRole }
  | { outcome: "unavailable" };

/**
 * Accepts a hunt invite for a user inside `tx`: grants the invite's role
 * unless the user already has that role or a higher one (then the invite is
 * not used up). Pass `db.transaction` callbacks' `tx` so the use count and the
 * membership change together.
 */
export async function acceptHuntInviteTx(
  tx: Tx,
  invite: Pick<Invite, "id" | "huntId" | "role">,
  userId: string,
): Promise<AcceptOutcome> {
  if (!invite.huntId) return { outcome: "unavailable" };
  const current = await getMembershipRole(tx, invite.huntId, userId);
  const next = upgradedRole(current, invite.role);
  if (!next) return { outcome: "already", role: current ?? invite.role };
  if (!(await consumeInvite(tx, invite.id))) return { outcome: "unavailable" };
  await writeRole(tx, invite.huntId, userId, next, current != null);
  return { outcome: "accepted", role: next, previous: current };
}

export async function createInvite(input: {
  huntId: string | null;
  role: StaffRole;
  createdBy: string;
  expiresAt: Date | null;
  maxUses: number | null;
}): Promise<Invite> {
  const [invite] = await db
    .insert(invites)
    .values({
      id: newToken(32),
      huntId: input.huntId,
      role: input.role,
      createdBy: input.createdBy,
      expiresAt: input.expiresAt,
      maxUses: input.maxUses,
    })
    .returning();
  return invite;
}

/** Revokes an invite. `huntId` scopes the lookup (null = platform invites only). Null when nothing was left to revoke. */
export async function revokeInvite(id: string, huntId: string | null): Promise<Invite | null> {
  const [row] = await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(invites.id, id), huntId ? eq(invites.huntId, huntId) : isNull(invites.huntId), isNull(invites.revokedAt)),
    )
    .returning();
  return row ?? null;
}

export type PlatformInviteRow = Invite & { creatorName: string | null; status: InviteStatus };

/** Platform (organizer account) invites, newest first. */
export async function listPlatformInvites(): Promise<PlatformInviteRow[]> {
  const rows = await db
    .select({ invite: invites, creatorName: users.name })
    .from(invites)
    .leftJoin(users, eq(users.id, invites.createdBy))
    .where(isNull(invites.huntId))
    .orderBy(desc(invites.createdAt));
  const now = new Date();
  return rows.map((r) => ({ ...r.invite, creatorName: r.creatorName, status: inviteStatus(r.invite, now) }));
}
