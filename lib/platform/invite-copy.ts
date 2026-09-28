import type { ActionState } from "@/lib/actions";
import { formatRelative } from "@/lib/format";
import { firstName, type InviteStatus } from "./rules";

/*
 * Wording for invite problems, shared by /invite/[token], /signup and the
 * server actions so a broken link reads the same everywhere.
 */

export type InviteProblem = Exclude<InviteStatus, "active"> | "missing";

export function inviteProblemCopy(
  problem: InviteProblem,
  opts: { inviterName?: string | null; expiresAt?: Date | null } = {},
): { title: string; body: string } {
  const who = opts.inviterName ? firstName(opts.inviterName) : null;
  const askFor = who ? `Ask ${who} for a new one.` : "Ask the person who sent it for a new one.";
  switch (problem) {
    case "missing":
      return {
        title: "This invite link doesn't work",
        body: "Check that you opened the whole link, or ask the person who sent it for a new one.",
      };
    case "revoked":
      return {
        title: "This invite link was turned off",
        body: `${who ?? "The organizer"} turned this link off. ${askFor}`,
      };
    case "expired":
      return {
        title: "This invite link has expired",
        body: `It stopped working ${opts.expiresAt ? formatRelative(opts.expiresAt) : "a while ago"}. ${askFor}`,
      };
    case "used":
      return {
        title: "This invite link has been used up",
        body: `It was set to work a limited number of times, and they've all been used. ${askFor}`,
      };
  }
}

/** Form state for the sign-in, setup and sign-up forms: the usual ActionState plus the typed values to restore. */
export type AuthFormState = (NonNullable<ActionState> & { values?: { name?: string; email?: string } }) | null;
