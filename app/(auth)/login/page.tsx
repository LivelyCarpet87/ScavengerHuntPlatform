import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/account-forms";
import { AuthLinks, AuthScreen, PlayerNote, TextLink } from "@/components/auth/auth-screen";
import { getSession } from "@/lib/auth/session";
import { hasAnyUser } from "@/lib/auth/users";
import { firstParam, safeNext } from "@/lib/platform/rules";
import { getSignupMode } from "@/lib/platform/settings";

export const metadata: Metadata = { title: "Sign in" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const rawNext = firstParam(sp.next);
  const next = rawNext ? safeNext(rawNext) : undefined;

  if (!(await hasAnyUser())) redirect("/setup");
  const session = await getSession();
  if (session?.user) redirect(next ?? "/dashboard");

  const signupOpen = (await getSignupMode()) === "open";
  // Coming from an invite link: offer to create an account with that invite.
  const inviteToken = next?.match(/^\/invite\/([A-Za-z0-9_-]+)$/)?.[1];
  const signupHref = inviteToken
    ? `/signup?invite=${inviteToken}`
    : signupOpen
      ? next
        ? `/signup?next=${encodeURIComponent(next)}`
        : "/signup"
      : null;

  return (
    <AuthScreen
      title="Sign in"
      description={inviteToken ? "Sign in to accept your invite." : "For organizers and judges."}
      note={<PlayerNote />}
    >
      <LoginForm next={next} />
      <AuthLinks>
        {signupHref ? (
          <p>
            {inviteToken ? "New here? " : "No account yet? "}
            <TextLink href={signupHref}>
              {inviteToken ? "Create an account with your invite" : "Create an organizer account"}
            </TextLink>
          </p>
        ) : null}
        <p>Forgot your password? A platform admin can set a new one for you.</p>
      </AuthLinks>
    </AuthScreen>
  );
}
