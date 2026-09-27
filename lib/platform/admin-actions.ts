"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { type ActionState, fail, ok, parseForm, zOptionalInt } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/access";
import { getSession } from "@/lib/auth/session";
import { countAdmins, newPasswordField, setUserPassword } from "@/lib/auth/users";
import { db } from "@/lib/db";
import { type User, users } from "@/lib/db/schema";
import { absoluteUrl } from "@/lib/url";
import { createInvite, invitePath, revokeInvite } from "./invites";
import { firstName, INVITE_LIFETIMES, type InviteLifetime, inviteExpiry } from "./rules";
import { SIGNUP_MODES, setSignupMode } from "./settings";

/*
 * Platform admin actions (/admin). Each one re-checks that the caller is a
 * platform admin and records an audit entry with huntId null.
 */

const userId = z.string({ message: "Pick an account." }).min(1).max(64);

/** Re-checked inside write transactions: another admin may have removed the caller's rights meanwhile. */
async function isStillAdmin(tx: Pick<typeof db, "select">, id: string): Promise<boolean> {
  const row = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, id), eq(users.isAdmin, true)))
    .get();
  return !!row;
}

// Admin rights -------------------------------------------------------------------

const AdminRightsSchema = z.object({ userId, admin: z.enum(["grant", "revoke"]) });

export async function setAdminAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const parsed = parseForm(AdminRightsSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { admin } = parsed.data;

  // One write transaction, so two admins can't demote each other at the same moment and leave none.
  type Outcome = { error: string } | { target: User; changed: boolean };
  const result = await db.transaction(async (tx): Promise<Outcome> => {
    if (!(await isStillAdmin(tx, me.id))) return { error: "You're no longer a platform admin." };
    const target = await tx.select().from(users).where(eq(users.id, parsed.data.userId)).get();
    if (!target) return { error: "That account no longer exists." };
    if (admin === "grant") {
      if (!target.isAdmin) await tx.update(users).set({ isAdmin: true }).where(eq(users.id, target.id));
      return { target, changed: !target.isAdmin };
    }
    if (target.id === me.id) return { error: "You can't remove your own admin rights. Ask another admin." };
    if (!target.isAdmin) return { target, changed: false };
    if ((await countAdmins(tx)) <= 1) {
      return { error: "This is the only platform admin. Make someone else an admin first." };
    }
    await tx.update(users).set({ isAdmin: false }).where(eq(users.id, target.id));
    return { target, changed: true };
  });
  if ("error" in result) return fail(result.error);

  const { target, changed } = result;
  if (changed) {
    await audit({
      huntId: null,
      actorUserId: me.id,
      action: admin === "grant" ? "user.admin_grant" : "user.admin_revoke",
      targetKind: "user",
      targetId: target.id,
      data: { email: target.email },
    });
  }
  refresh();
  return ok(
    admin === "grant"
      ? `${firstName(target.name)} is now a platform admin.`
      : `${firstName(target.name)} is no longer a platform admin.`,
  );
}

// Hunt creation --------------------------------------------------------------------

const CreatorSchema = z.object({ userId, creator: z.enum(["grant", "revoke"]) });

/** Lets an account create its own hunts (organizer access), or takes that away. */
export async function setCreatorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const parsed = parseForm(CreatorSchema, formData);
  if (!parsed.ok) return parsed.state;
  const grant = parsed.data.creator === "grant";
  const target = await db.select().from(users).where(eq(users.id, parsed.data.userId)).get();
  if (!target) return fail("That account no longer exists.");
  if (target.isAdmin) return fail("Platform admins can always create hunts.");
  if (target.canCreateHunts !== grant) {
    await db.update(users).set({ canCreateHunts: grant }).where(eq(users.id, target.id));
    await audit({
      huntId: null,
      actorUserId: me.id,
      action: grant ? "user.creator_grant" : "user.creator_revoke",
      targetKind: "user",
      targetId: target.id,
      data: { email: target.email },
    });
  }
  refresh();
  return ok(
    grant
      ? `${firstName(target.name)} can now create hunts.`
      : `${firstName(target.name)} can no longer create hunts. Hunts they already run stay theirs.`,
  );
}

// Passwords ------------------------------------------------------------------------

const PasswordSchema = z.object({ userId, password: newPasswordField });

export async function setPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const parsed = parseForm(PasswordSchema, formData);
  if (!parsed.ok) return parsed.state;
  const target = await db.select().from(users).where(eq(users.id, parsed.data.userId)).get();
  if (!target) return fail("That account no longer exists.");

  const self = target.id === me.id;
  const session = await getSession();
  await setUserPassword(target.id, parsed.data.password, self ? session?.session.id : undefined);
  await audit({
    huntId: null,
    actorUserId: me.id,
    action: "user.set_password",
    targetKind: "user",
    targetId: target.id,
    data: { email: target.email },
  });
  refresh();
  return ok(
    self
      ? "New password set. You've been signed out on your other devices."
      : `New password set. ${firstName(target.name)} has been signed out everywhere; tell them the new password.`,
  );
}

// Deleting accounts ----------------------------------------------------------------------

export async function deleteUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const parsed = parseForm(z.object({ userId }), formData);
  if (!parsed.ok) return parsed.state;
  if (parsed.data.userId === me.id) return fail("You can't delete your own account.");

  // One write transaction, so two admins deleting each other at the same moment can't leave none.
  // Staff roles cascade; sessions, audit entries and judged submissions keep their rows with the user cleared.
  type Outcome = { error: string } | { target: User };
  const result = await db.transaction(async (tx): Promise<Outcome> => {
    const target = await tx.select().from(users).where(eq(users.id, parsed.data.userId)).get();
    if (!target) return { error: "That account no longer exists." };
    if (!(await isStillAdmin(tx, me.id))) return { error: "You're no longer a platform admin." };
    await tx.delete(users).where(eq(users.id, target.id));
    return { target };
  });
  if ("error" in result) return fail(result.error);
  const { target } = result;

  await audit({
    huntId: null,
    actorUserId: me.id,
    action: "user.delete",
    targetKind: "user",
    targetId: target.id,
    data: { email: target.email, name: target.name, wasAdmin: target.isAdmin },
  });
  refresh();
  return ok(`Deleted ${target.name}'s account.`);
}

// Sign-up mode ----------------------------------------------------------------------------

const SignupModeSchema = z.object({
  mode: z.enum(SIGNUP_MODES, { message: "Choose who can create organizer accounts." }),
});

export async function setSignupModeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const parsed = parseForm(SignupModeSchema, formData);
  if (!parsed.ok) return parsed.state;
  await setSignupMode(parsed.data.mode);
  await audit({ huntId: null, actorUserId: me.id, action: "settings.signup_mode", data: { mode: parsed.data.mode } });
  refresh();
  return ok(
    parsed.data.mode === "open"
      ? "Anyone can create an organizer account now."
      : "Organizer accounts are invite-only now.",
  );
}

// Invite links ----------------------------------------------------------------------------

const lifetimes = INVITE_LIFETIMES.map((l) => l.value) as [InviteLifetime, ...InviteLifetime[]];

const CreateInviteSchema = z.object({
  lifetime: z.enum(lifetimes, { message: "Choose when the link stops working." }),
  maxUses: zOptionalInt({ min: 1, max: 1000, label: "The number of uses" }),
});

export async function createPlatformInviteAction(
  _prev: ActionState<{ url: string }>,
  formData: FormData,
): Promise<ActionState<{ url: string }>> {
  const me = await requireAdmin();
  const parsed = parseForm(CreateInviteSchema, formData);
  if (!parsed.ok) return parsed.state;
  const invite = await createInvite({
    huntId: null,
    role: "organizer",
    createdBy: me.id,
    expiresAt: inviteExpiry(parsed.data.lifetime),
    maxUses: parsed.data.maxUses,
  });
  await audit({
    huntId: null,
    actorUserId: me.id,
    action: "invite.create",
    targetKind: "invite",
    targetId: invite.id,
    data: { expiresAt: invite.expiresAt?.toISOString() ?? null, maxUses: invite.maxUses },
  });
  refresh();
  return ok("Invite link created. Copy it and send it to the new organizer.", {
    url: await absoluteUrl(invitePath(invite.id)),
  });
}

export async function revokePlatformInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const parsed = parseForm(z.object({ inviteId: z.string().min(1).max(200) }), formData);
  if (!parsed.ok) return parsed.state;
  const revoked = await revokeInvite(parsed.data.inviteId, null);
  if (!revoked) return fail("That link is already turned off.");
  await audit({
    huntId: null,
    actorUserId: me.id,
    action: "invite.revoke",
    targetKind: "invite",
    targetId: revoked.id,
  });
  refresh();
  return ok("Invite link turned off. Anyone who has it can no longer use it.");
}
