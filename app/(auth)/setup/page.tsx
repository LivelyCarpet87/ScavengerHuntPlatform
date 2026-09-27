import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SetupForm } from "@/components/auth/account-forms";
import { AuthScreen, MascotNote } from "@/components/auth/auth-screen";
import { hasAnyUser } from "@/lib/auth/users";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Set up" };

/** First run: exists only while there are no accounts at all. */
export default async function SetupPage() {
  await connection();
  if (await hasAnyUser()) redirect("/login");

  return (
    <AuthScreen
      title={`Set up ${env.appName}`}
      description={
        <p>
          Create the first account. It becomes the platform admin: it can create hunts, invite organizers and judges,
          and see every hunt on this server.
        </p>
      }
      mapSeed="first-run"
      note={
        <MascotNote title="What happens next">
          You'll create your first hunt and add its tasks. Players join from their phones with the hunt's six-digit code
          — they never need an account.
        </MascotNote>
      }
    >
      <SetupForm />
    </AuthScreen>
  );
}
