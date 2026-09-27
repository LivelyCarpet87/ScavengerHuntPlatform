import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/account-forms";
import { AuthLinks, AuthScreen, MascotNote, PlayerNote, TextLink } from "@/components/auth/auth-screen";
import { InviteHuntCard } from "@/components/auth/invite-parts";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { getSession } from "@/lib/auth/session";
import { hasAnyUser } from "@/lib/auth/users";
import { env } from "@/lib/env";
import { inviteProblemCopy } from "@/lib/platform/invite-copy";
import { getInviteView } from "@/lib/platform/invites";
import { firstName, firstParam, isPlausibleToken, ROLE_VERB, safeNext } from "@/lib/platform/rules";
import { getSignupMode } from "@/lib/platform/settings";

export const metadata: Metadata = { title: "Create an account" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SignupPage({ searchParams }: Props) {
  const sp = await searchParams;
  const rawToken = firstParam(sp.invite)?.trim();
  const token = rawToken && isPlausibleToken(rawToken) ? rawToken : rawToken ? "" : undefined;
  const rawNext = firstParam(sp.next);
  const next = rawNext ? safeNext(rawNext) : undefined;

  if (!(await hasAnyUser())) redirect("/setup");
  const session = await getSession();
  if (session?.user) redirect(token ? `/invite/${token}` : (next ?? "/dashboard"));

  const [mode, view] = await Promise.all([getSignupMode(), token ? getInviteView(token) : null]);
  const invite = view?.status === "active" ? view : null;
  // A link was given but doesn't work: explain why (same words as /invite/[token]).
  const problem =
    token !== undefined && !invite
      ? inviteProblemCopy(view ? (view.status as Exclude<typeof view.status, "active">) : "missing", {
          inviterName: view?.inviterName,
          expiresAt: view?.invite.expiresAt,
        })
      : null;
  const loginHref = invite
    ? `/login?next=${encodeURIComponent(`/invite/${token}`)}`
    : next
      ? `/login?next=${encodeURIComponent(next)}`
      : "/login";

  // Invite-only and no usable invite ------------------------------------------------------------
  if (!invite && mode !== "open") {
    return (
      <AuthScreen
        title={problem ? problem.title : "Accounts are invite-only here"}
        description={<p>{problem ? problem.body : "Ask an organizer for an invite link."}</p>}
        note={<PlayerNote />}
      >
        <p className="mb-3 font-semibold">Already have an account?</p>
        <ButtonLink href={loginHref} size="lg" className="w-full">
          Sign in
        </ButtonLink>
      </AuthScreen>
    );
  }

  const inviter = invite?.inviterName ? firstName(invite.inviterName) : null;
  const hunt = invite?.hunt ?? null;

  let title = "Create an organizer account";
  let description = "Create hunts, write tasks and judge what teams send in.";
  if (invite && hunt) {
    title = "Create your account";
    description = `${inviter ?? "An organizer"} invited you to ${ROLE_VERB[invite.invite.role]} ${hunt.name}. Create an account to accept.`;
  } else if (invite) {
    title = "Create your organizer account";
    description = `${inviter ?? "An admin"} invited you to run hunts on ${env.appName}.`;
  }

  return (
    <AuthScreen
      title={title}
      description={<p>{description}</p>}
      mapSeed={hunt?.id}
      note={
        hunt ? (
          <MascotNote title="Staff and players can share a phone">
            Your staff sign-in stays separate from any team you join on this device.
          </MascotNote>
        ) : invite ? (
          <MascotNote title="Players never need an account">
            Once your hunt is ready, teams join from their phones with its six-digit hunt code.
          </MascotNote>
        ) : (
          <PlayerNote />
        )
      }
    >
      <div className="flex flex-col gap-6">
        {problem ? (
          <Notice tone="warning" title={problem.title}>
            You can still create an account.
          </Notice>
        ) : null}
        {hunt ? <InviteHuntCard hunt={hunt} /> : null}
        <SignupForm
          invite={invite ? token : undefined}
          next={next}
          submitLabel={hunt ? "Create account and accept invite" : "Create account"}
        />
      </div>
      <AuthLinks>
        <p>
          Already have an account? <TextLink href={loginHref}>{hunt ? "Sign in to accept" : "Sign in"}</TextLink>
        </p>
      </AuthLinks>
    </AuthScreen>
  );
}
