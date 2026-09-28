import type { Metadata } from "next";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import { AuthLinks, AuthScreen, MascotNote, PlayerNote, TextLink } from "@/components/auth/auth-screen";
import { InviteHuntCard, SignedInAs } from "@/components/auth/invite-parts";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { canCreateHunts } from "@/lib/auth/access";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { inviteProblemCopy } from "@/lib/platform/invite-copy";
import { getInviteView, getMembershipRole } from "@/lib/platform/invites";
import { firstName, ROLE_DESCRIPTION, ROLE_NOUN, ROLE_VERB, upgradedRole } from "@/lib/platform/rules";

export const metadata: Metadata = { title: "Invitation", robots: { index: false } };

type Props = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const [view, session] = await Promise.all([getInviteView(token), getSession()]);
  const user = session?.user ?? null;
  const here = `/invite/${token}`;

  // Who's opening it: someone already on the invite's hunt (say, reopening a link they
  // accepted, since used up or expired) just needs to get back in, whatever the link says.
  const hunt = view?.hunt ?? null;
  const current = user && hunt && !user.isAdmin ? await getMembershipRole(db, hunt.id, user.id) : null;
  const alreadyCovered = Boolean(
    view && hunt && user && (user.isAdmin || (current && !upgradedRole(current, view.invite.role))),
  );

  // Broken links -----------------------------------------------------------------
  if (!view || (view.status !== "active" && !alreadyCovered)) {
    const copy = view
      ? inviteProblemCopy(view.status as Exclude<typeof view.status, "active">, {
          inviterName: view.inviterName,
          expiresAt: view.invite.expiresAt,
        })
      : inviteProblemCopy("missing");
    return (
      <AuthScreen
        title={copy.title}
        description={
          <>
            <p>{copy.body}</p>
            {hunt && current ? (
              <p className="mt-2">
                You're still {ROLE_NOUN[current]} on {hunt.name}.
              </p>
            ) : null}
          </>
        }
        note={hunt && current ? undefined : <PlayerNote />}
      >
        <div className="flex flex-col gap-3">
          {hunt && current ? (
            <ButtonLink href={`/manage/${hunt.id}`} size="lg" className="w-full">
              Open the hunt
            </ButtonLink>
          ) : hunt && user ? (
            <ButtonLink href="/dashboard" size="lg" className="w-full">
              Go to your hunts
            </ButtonLink>
          ) : (
            <ButtonLink href="/" size="lg" variant="secondary" className="w-full">
              Go to the home page
            </ButtonLink>
          )}
        </div>
      </AuthScreen>
    );
  }

  const inviter = view.inviterName ? firstName(view.inviterName) : null;

  // Platform invite: create an organizer account ---------------------------------------
  if (!hunt) {
    return (
      <AuthScreen
        title={
          inviter
            ? `${inviter} invited you to run hunts on ${env.appName}`
            : `You're invited to run hunts on ${env.appName}`
        }
        description={<p>Create an organizer account to make your own hunts, write tasks and invite judges.</p>}
        mapSeed="organizer-invite"
        note={
          <MascotNote title="Players never need an account">
            Once your hunt is ready, teams join from their phones with its six-digit hunt code.
          </MascotNote>
        }
      >
        {user && canCreateHunts(user) ? (
          <div className="flex flex-col gap-5">
            <Notice tone="info" title="Your account can already create hunts">
              This invite gives organizer access, and you have it already.
            </Notice>
            <ButtonLink href="/dashboard/new" size="lg" className="w-full">
              Create a hunt
            </ButtonLink>
            <SignedInAs user={user} returnTo={here} />
          </div>
        ) : user ? (
          <div className="flex flex-col gap-5">
            <p className="text-ink-2">
              Accept to create and run your own hunts with this account. The hunts you already work on stay as they are.
            </p>
            <AcceptInviteForm token={token} />
            <SignedInAs user={user} returnTo={here} />
          </div>
        ) : (
          <>
            <ButtonLink href={`/signup?invite=${token}`} size="lg" className="w-full">
              Create an account
            </ButtonLink>
            <AuthLinks>
              <p>
                Already have an account? <TextLink href="/login">Sign in</TextLink>
              </p>
            </AuthLinks>
          </>
        )}
      </AuthScreen>
    );
  }

  // Hunt invite -------------------------------------------------------------------------
  const role = view.invite.role;
  // Keep "co-own" in one piece: a headline broken at its hyphen reads badly.
  const verb = <span className="whitespace-nowrap">{ROLE_VERB[role]}</span>;
  const title = inviter ? (
    <>
      {inviter} invited you to {verb} {hunt.name}
    </>
  ) : (
    <>
      You're invited to {verb} {hunt.name}
    </>
  );
  return (
    <AuthScreen
      title={title}
      mapSeed={hunt.id}
      note={<MascotNote title={`As ${ROLE_NOUN[role]}`}>{ROLE_DESCRIPTION[role]}</MascotNote>}
    >
      <div className="flex flex-col gap-6">
        <InviteHuntCard hunt={hunt} />
        {user && alreadyCovered ? (
          <div className="flex flex-col gap-5">
            <Notice tone="success" title="You're all set">
              {user.isAdmin
                ? "You're a platform admin, so you already have full access to this hunt."
                : `You're already ${ROLE_NOUN[current ?? role]} on ${hunt.name}.`}
            </Notice>
            <ButtonLink href={`/manage/${hunt.id}`} size="lg" className="w-full">
              Open the hunt
            </ButtonLink>
            <SignedInAs user={user} returnTo={here} />
          </div>
        ) : user ? (
          <div className="flex flex-col gap-5">
            {current ? (
              <p className="text-sm text-ink-2">
                You're {ROLE_NOUN[current]} on this hunt now. Accepting makes you {ROLE_NOUN[role]}.
              </p>
            ) : null}
            <AcceptInviteForm token={token} />
            <SignedInAs user={user} returnTo={here} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <ButtonLink href={`/signup?invite=${token}`} size="lg" className="w-full">
              Create an account
            </ButtonLink>
            <ButtonLink
              href={`/login?next=${encodeURIComponent(here)}`}
              size="lg"
              variant="secondary"
              className="w-full"
            >
              Sign in to accept
            </ButtonLink>
          </div>
        )}
      </div>
    </AuthScreen>
  );
}
