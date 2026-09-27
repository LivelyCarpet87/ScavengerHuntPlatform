import { ButtonLink } from "@/components/ui/button";
import { LiveDot } from "@/components/ui/misc";
import { TeamAvatar } from "@/components/ui/team-badge";
import type { DeviceHunt } from "@/lib/player/queries";

/**
 * On phones, "Your hunts" sits below the code entry, out of sight. When one of
 * them is live, this bar under the header takes the player straight back in.
 */
export function ResumeBar({ entry }: { entry: DeviceHunt }) {
  const { hunt, team } = entry;
  return (
    <div data-accent={hunt.accent} className="border-b border-line sm:hidden">
      <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-2.5">
        <TeamAvatar team={team} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{hunt.name}</p>
          <p className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
            <LiveDot label="Live now" className="shrink-0 whitespace-nowrap" />
            <span className="truncate">{team.name}</span>
          </p>
        </div>
        <ButtonLink href={`/h/${hunt.slug}`} size="sm">
          Back to the hunt
        </ButtonLink>
      </div>
    </div>
  );
}
