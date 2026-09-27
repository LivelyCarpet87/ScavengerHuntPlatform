"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, fail, formToObject, parseForm } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/access";
import { hashPassword } from "@/lib/auth/password";
import { signInUser, signOutUser } from "@/lib/auth/session";
import {
  createFirstAdmin,
  EmailTakenError,
  emailField,
  hasAnyUser,
  insertUser,
  nameField,
  newPasswordField,
  verifyCredentials,
} from "@/lib/auth/users";
import { db } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { formatDuration } from "@/lib/format";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { type AuthFormState, inviteProblemCopy } from "./invite-copy";
import { type AcceptOutcome, acceptHuntInviteTx, consumeInvite, getInviteView } from "./invites";
import { isPlausibleToken, safeNext } from "./rules";
import { getSignupMode } from "./settings";

/*
 * Staff authentication: first-run setup, sign in, sign up and invite
 * acceptance. Every action re-validates its input and permissions — they are
 * public endpoints.
 */

const MIN = 60_000;

function typedValues(formData: FormData): { name?: string; email?: string } {
  const raw = formToObject(formData);
  const pick = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).slice(0, 300) : undefined);
  return { name: pick("name"), email: pick("email") };
}

function withValues(state: ActionState, formData: FormData): AuthFormState {
  return state ? { ...state, values: typedValues(formData) } : null;
}

function tooMany(retryAfterSec: number, what: string): ActionState {
  return fail(`Too many ${what}. Try again in ${formatDuration(Math.max(retryAfterSec, 60) * 1000)}.`);
}

// Sign in ----------------------------------------------------------------------

const LoginSchema = z.object({
  email: emailField,
  password: z.string({ message: "Enter your password." }).min(1, "Enter your password.").max(256),
  next: z.string().optional(),
});

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = parseForm(LoginSchema, formData);
  if (!parsed.ok) return withValues(parsed.state, formData);
  const { email, password, next } = parsed.data;

  const ip = await clientIp();
  const byIp = rateLimit(`login:ip:${ip}`, 30, 15 * MIN);
  const byEmail = rateLimit(`login:email:${email}`, 8, 15 * MIN);
  if (!byIp.ok || !byEmail.ok) {
    return withValues(tooMany(Math.max(byIp.retryAfterSec, byEmail.retryAfterSec), "sign-in attempts"), formData);
  }

  const user = await verifyCredentials(email, password);
  if (!user) return withValues(fail("That email and password don't match."), formData);

  await signInUser(user.id);
  redirect(safeNext(next));
}

// First-run setup ----------------------------------------------------------------

const AccountSchema = z.object({
  name: nameField,
  email: emailField,
  password: newPasswordField,
});

export async function setupAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = parseForm(AccountSchema, formData);
  if (!parsed.ok) return withValues(parsed.state, formData);

  // Setup is over once any account exists; don't spend a password hash on it.
  if (await hasAnyUser()) redirect("/login");
  const limit = rateLimit(`setup:ip:${await clientIp()}`, 10, 15 * MIN);
  if (!limit.ok) return withValues(tooMany(limit.retryAfterSec, "attempts"), formData);

  const passwordHash = await hashPassword(parsed.data.password);
  let created: User | null;
  try {
    created = await createFirstAdmin({ name: parsed.data.name, email: parsed.data.email, passwordHash });
  } catch (err) {
    // Lost a race with another setup (database busy): if an account exists now, that one won.
    if (await hasAnyUser()) redirect("/login");
    throw err;
  }
  if (!created) redirect("/login");

  await signInUser(created.id);
  await audit({
    huntId: null,
    actorUserId: created.id,
    action: "platform.setup",
    targetKind: "user",
    targetId: created.id,
    data: { email: created.email },
  });
  redirect("/dashboard/new");
}

// Sign up ------------------------------------------------------------------------

const SignupSchema = AccountSchema.extend({
  invite: z.string().max(200).optional(),
  next: z.string().optional(),
});

class InviteUnavailableError extends Error {}

export async function signupAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = parseForm(SignupSchema, formData);
  if (!parsed.ok) return withValues(parsed.state, formData);
  const { name, email, password, next } = parsed.data;

  if (!(await hasAnyUser())) redirect("/setup");

  // Generous enough for a crew of volunteers signing up on the venue's Wi-Fi.
  const limit = rateLimit(`signup:ip:${await clientIp()}`, 30, 60 * MIN);
  if (!limit.ok) return withValues(tooMany(limit.retryAfterSec, "sign-ups from this network"), formData);

  const token = parsed.data.invite?.trim() || null;
  const view = token ? await getInviteView(token) : null;
  const inviteUsable = view?.status === "active";
  const mode = await getSignupMode();

  if (!inviteUsable && mode !== "open") {
    const copy = token
      ? inviteProblemCopy(view ? (view.status as Exclude<typeof view.status, "active">) : "missing", {
          inviterName: view?.inviterName,
          expiresAt: view?.invite.expiresAt,
        })
      : null;
    return withValues(
      fail(copy ? copy.body : "Accounts are invite-only here. Ask an organizer for an invite link."),
      formData,
    );
  }

  const passwordHash = await hashPassword(password);
  let user: User;
  let accepted: AcceptOutcome | null = null;
  let usedPlatformInvite = false;
  try {
    ({ user, accepted, usedPlatformInvite } = await db.transaction(async (tx) => {
      const created = await insertUser({ name, email, passwordHash }, tx);
      let outcome: AcceptOutcome | null = null;
      let platformUse = false;
      if (view && inviteUsable) {
        if (view.invite.huntId) {
          outcome = await acceptHuntInviteTx(tx, view.invite, created.id);
          if (outcome.outcome === "unavailable" && mode !== "open") throw new InviteUnavailableError();
        } else {
          platformUse = await consumeInvite(tx, view.invite.id);
          if (!platformUse && mode !== "open") throw new InviteUnavailableError();
        }
      }
      return { user: created, accepted: outcome, usedPlatformInvite: platformUse };
    }));
  } catch (err) {
    if (err instanceof EmailTakenError) {
      return withValues(
        fail("There's already an account with this email.", {
          email: "There's already an account with this email. Sign in instead.",
        }),
        formData,
      );
    }
    if (err instanceof InviteUnavailableError) {
      return withValues(fail("This invite link was just used up or turned off. Ask for a new one."), formData);
    }
    throw err;
  }

  await signInUser(user.id);
  await audit({
    huntId: null,
    actorUserId: user.id,
    action: "user.signup",
    targetKind: "user",
    targetId: user.id,
    data: {
      email: user.email,
      via: usedPlatformInvite ? "platform-invite" : accepted?.outcome === "accepted" ? "hunt-invite" : "open",
    },
  });
  if (usedPlatformInvite && view) {
    await audit({
      huntId: null,
      actorUserId: user.id,
      action: "invite.accept",
      targetKind: "invite",
      targetId: view.invite.id,
    });
  }
  if (view?.hunt && accepted && accepted.outcome !== "unavailable") {
    if (accepted.outcome === "accepted") {
      await audit({
        huntId: view.hunt.id,
        actorUserId: user.id,
        action: "invite.accept",
        targetKind: "invite",
        targetId: view.invite.id,
        data: { role: accepted.role },
      });
    }
    redirect(`/manage/${view.hunt.id}`);
  }
  redirect(safeNext(next));
}

// Invites --------------------------------------------------------------------------

const AcceptInviteSchema = z.object({
  token: z
    .string({ message: inviteProblemCopy("missing").body })
    .refine(isPlausibleToken, inviteProblemCopy("missing").body),
});

/** "Accept invite" on /invite/[token] for a signed-in user. */
export async function acceptInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(AcceptInviteSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { token } = parsed.data;
  const user = await requireUser(`/invite/${token}`);

  const view = await getInviteView(token);
  if (!view?.hunt) return fail(inviteProblemCopy("missing").body);
  if (view.status !== "active") {
    return fail(
      inviteProblemCopy(view.status, { inviterName: view.inviterName, expiresAt: view.invite.expiresAt }).body,
    );
  }
  // Platform admins already act as owner of every hunt; nothing to accept.
  if (user.isAdmin) redirect(`/manage/${view.hunt.id}`);

  const outcome = await db.transaction((tx) => acceptHuntInviteTx(tx, view.invite, user.id));
  if (outcome.outcome === "unavailable")
    return fail("This invite link was just used up or turned off. Ask for a new one.");
  if (outcome.outcome === "accepted") {
    await audit({
      huntId: view.hunt.id,
      actorUserId: user.id,
      action: "invite.accept",
      targetKind: "invite",
      targetId: view.invite.id,
      data: { role: outcome.role, previousRole: outcome.previous },
    });
  }
  redirect(`/manage/${view.hunt.id}`);
}

/** Signs the staff user out on this device and returns to `next` (e.g. back to an invite). */
export async function signOutAndReturnAction(formData: FormData): Promise<void> {
  await signOutUser();
  redirect(safeNext(formData.get("next"), "/"));
}
