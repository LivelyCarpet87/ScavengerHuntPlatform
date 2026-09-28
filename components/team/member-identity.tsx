import { Crown } from "lucide-react";
import type { Player } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

/** First letter of a name, for the member disc. */
function initial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}

/** A member's disc, name and tags (captain, you, device status). */
export function MemberIdentity({
  member,
  isMe,
  className,
}: {
  member: Pick<Player, "name" | "isCaptain"> & { signedIn: boolean };
  isMe: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 flex-1 items-center gap-3", className)}>
      <span
        aria-hidden
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full font-cond text-lg font-extrabold",
          isMe ? "bg-accent text-accent-ink" : "bg-mist text-ink-2",
        )}
      >
        {initial(member.name)}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate font-semibold">{member.name}</span>
          {isMe ? <span className="text-sm font-medium text-accent">You</span> : null}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
          {member.isCaptain ? (
            <span className="inline-flex items-center gap-1">
              <Crown aria-hidden className="size-3.5 text-ink" />
              Captain
            </span>
          ) : null}
          {!member.signedIn ? <span>Not signed in on any device</span> : null}
        </span>
      </span>
    </span>
  );
}

/** Read-only list of a team's members. */
export function Roster({
  members,
  meId,
  className,
}: {
  members: Pick<Player, "id" | "name" | "isCaptain" | "sessionId">[];
  meId: string;
  className?: string;
}) {
  return (
    <ul className={cn("divide-y divide-line border-y border-line", className)}>
      {members.map((m) => (
        <li key={m.id} className="flex min-h-16 items-center py-2.5">
          <MemberIdentity
            member={{ name: m.name, isCaptain: m.isCaptain, signedIn: m.sessionId != null }}
            isMe={m.id === meId}
          />
        </li>
      ))}
    </ul>
  );
}
