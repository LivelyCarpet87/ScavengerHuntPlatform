"use server";

import { and, count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, fail, ok, parseForm } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireStaff, roleAtLeast } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { huntStaff, invites, STAFF_ROLES, type StaffRole, users } from "@/lib/db/schema";
import { newToken } from "@/lib/ids";
import { absoluteUrl } from "@/lib/url";
import { revalidateHunt } from "./batch";
import { zId, zOptNumber } from "./zod";

/*
 * Hunt staff and invite links. Organizers manage judges and organizers; only
 * owners add, change or remove owners, and a hunt always keeps one owner.
 */

const ROLE_NAMES: Record<StaffRole, string> = { owner: "an owner", organizer: "an organizer", judge: "a judge" };

async function ownerCount(huntId: string): Promise<number> {
  const row = await db
    .select({ n: count() })
    .from(huntStaff)
    .where(and(eq(huntStaff.huntId, huntId), eq(huntStaff.role, "owner")))
    .get();
  return row?.n ?? 0;
}

async function loadMember(huntId: string, userId: string) {
  return (
    (await db
      .select({ userId: huntStaff.userId, role: huntStaff.role, name: users.name })
      .from(huntStaff)
      .innerJoin(users, eq(users.id, huntStaff.userId))
      .where(and(eq(huntStaff.huntId, huntId), eq(huntStaff.userId, userId)))
      .get()) ?? null
  );
}

const RoleSchema = z.object({
  huntId: zId,
  userId: zId,
  role: z.enum(STAFF_ROLES, { message: "Pick a role." }),
});

export async function changeStaffRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(RoleSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const { user, hunt, role: myRole } = await requireStaff(d.huntId, "organizer");
  const member = await loadMember(hunt.id, d.userId);
  if (!member) return fail("This person is no longer on the staff. Reload the page.");
  if (member.role === d.role) return ok(`${member.name} is already ${ROLE_NAMES[d.role]}.`);
  if ((member.role === "owner" || d.role === "owner") && myRole !== "owner") {
    return fail("Only owners can make someone an owner or change an owner’s role.");
  }
  if (member.role === "owner" && (await ownerCount(hunt.id)) <= 1) {
    return fail("A hunt needs at least one owner. Make someone else an owner first.");
  }
  await db
    .update(huntStaff)
    .set({ role: d.role })
    .where(and(eq(huntStaff.huntId, hunt.id), eq(huntStaff.userId, member.userId)));
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "staff.role",
    targetKind: "user",
    targetId: member.userId,
    data: { name: member.name, from: member.role, to: d.role },
  });
  revalidateHunt(hunt.id);
  // Stepping down to judge loses access to settings: land on the overview.
  if (member.userId === user.id && !user.isAdmin && !roleAtLeast(d.role, "organizer")) {
    redirect(`/manage/${hunt.id}`);
  }
  return ok(`${member.name} is now ${ROLE_NAMES[d.role]}.`);
}

const MemberRef = z.object({ huntId: zId, userId: zId });

export async function removeStaffAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(MemberRef, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt, role: myRole } = await requireStaff(parsed.data.huntId, "organizer");
  const member = await loadMember(hunt.id, parsed.data.userId);
  if (!member) return ok("Removed.");
  if (member.role === "owner" && myRole !== "owner") return fail("Only owners can remove an owner.");
  if (member.role === "owner" && (await ownerCount(hunt.id)) <= 1) {
    return fail("A hunt needs at least one owner. Make someone else an owner before removing this one.");
  }
  await db.delete(huntStaff).where(and(eq(huntStaff.huntId, hunt.id), eq(huntStaff.userId, member.userId)));
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "staff.remove",
    targetKind: "user",
    targetId: member.userId,
    data: { name: member.name, role: member.role },
  });
  revalidateHunt(hunt.id);
  if (member.userId === user.id && !user.isAdmin) redirect("/dashboard");
  return ok(`${member.name} no longer has access to this hunt.`);
}

const InviteSchema = z.object({
  huntId: zId,
  role: z.enum(STAFF_ROLES, { message: "Pick a role for the invite." }),
  expires: z.enum(["1", "7", "30", "never"]).catch("7"),
  maxUses: zOptNumber("the number of uses", { min: 1, max: 1000 }),
});

export async function createInviteAction(
  _prev: ActionState<{ url: string }>,
  formData: FormData,
): Promise<ActionState<{ url: string }>> {
  const parsed = parseForm(InviteSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const { user, hunt, role: myRole } = await requireStaff(d.huntId, "organizer");
  if (d.role === "owner" && myRole !== "owner") return fail("Only owners can invite other owners.");
  const id = newToken(24);
  const expiresAt = d.expires === "never" ? null : new Date(Date.now() + Number(d.expires) * 24 * 60 * 60 * 1000);
  await db
    .insert(invites)
    .values({ id, huntId: hunt.id, role: d.role, createdBy: user.id, expiresAt, maxUses: d.maxUses });
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "invite.create",
    targetKind: "invite",
    targetId: id,
    data: { role: d.role, expiresAt: expiresAt?.toISOString() ?? null, maxUses: d.maxUses },
  });
  revalidateHunt(hunt.id);
  return ok("Invite link ready. Copy it and send it to the person you’re inviting.", {
    url: await absoluteUrl(`/invite/${id}`),
  });
}

const InviteRef = z.object({ huntId: zId, inviteId: zId });

export async function revokeInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(InviteRef, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(and(eq(invites.id, parsed.data.inviteId), eq(invites.huntId, hunt.id)));
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "invite.revoke",
    targetKind: "invite",
    targetId: parsed.data.inviteId,
  });
  revalidateHunt(hunt.id);
  return ok("Invite link revoked. It no longer works.");
}
