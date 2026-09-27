import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";

/*
 * Platform-wide settings stored in the `settings` key/value table.
 */

export const SIGNUP_MODES = ["invite", "open"] as const;
export type SignupMode = (typeof SIGNUP_MODES)[number];

const SIGNUP_KEY = "signupMode";

/**
 * Who may create an organizer account:
 *   invite – only people holding an invite link (the default)
 *   open   – anyone who can reach the site
 */
export async function getSignupMode(): Promise<SignupMode> {
  const row = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, SIGNUP_KEY)).get();
  return row?.value === "open" ? "open" : "invite";
}

export async function setSignupMode(mode: SignupMode): Promise<void> {
  await db
    .insert(settings)
    .values({ key: SIGNUP_KEY, value: mode })
    .onConflictDoUpdate({ target: settings.key, set: { value: mode } });
}
