import type { ReactNode } from "react";
import { HuntPhaseChip } from "@/components/shells/staff-shell";
import { ContourArt } from "@/components/ui/contour-art";
import { FinishMark, StartMark } from "@/components/ui/control";
import type { Hunt } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format";
import { signOutAndReturnAction } from "@/lib/platform/auth-actions";
import { cn } from "@/lib/utils";

/** The hunt an invite is for: its terrain, name, phase and schedule. */
export function InviteHuntCard({
  hunt,
  className,
}: {
  hunt: Pick<Hunt, "id" | "name" | "tagline" | "status" | "startsAt" | "endsAt" | "timezone">;
  className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-line bg-paper", className)}>
      <ContourArt seed={hunt.id} strength="faint" />
      <div className="relative p-5">
        <HuntPhaseChip hunt={hunt} />
        <p className="mt-2 font-cond text-3xl leading-tight font-extrabold tracking-tight break-words">{hunt.name}</p>
        {hunt.tagline ? <p className="mt-1 text-sm text-ink-2">{hunt.tagline}</p> : null}
        {hunt.startsAt || hunt.endsAt ? (
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {hunt.startsAt ? (
              <div className="flex items-center gap-2">
                <StartMark size={18} />
                <dt className="text-ink-2">Starts</dt>
                <dd className="font-semibold">{formatDateTime(hunt.startsAt, hunt.timezone)}</dd>
              </div>
            ) : null}
            {hunt.endsAt ? (
              <div className="flex items-center gap-2">
                <FinishMark size={18} />
                <dt className="text-ink-2">Ends</dt>
                <dd className="font-semibold">{formatDateTime(hunt.endsAt, hunt.timezone)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>
    </div>
  );
}

/** "Signed in as Sam Okafor (sam@…). Not you? Sign out" — signs out and comes back to `returnTo`. */
export function SignedInAs({
  user,
  returnTo,
  children,
}: {
  user: { name: string; email: string };
  returnTo: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-2">
      <span className="min-w-0 break-words">
        Signed in as <span className="font-semibold text-ink">{user.name}</span> ({user.email}).
      </span>
      {children}
      <form action={signOutAndReturnAction}>
        <input type="hidden" name="next" value={returnTo} />
        <button
          type="submit"
          className="inline-flex min-h-11 items-center font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
        >
          Not you? Sign out
        </button>
      </form>
    </div>
  );
}
