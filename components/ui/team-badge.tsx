import { teamColorHex } from "@/lib/palette";
import { cn } from "@/lib/utils";

type TeamLike = { name: string; emoji: string; color: string };

const sizes = {
  sm: "size-7 text-sm",
  md: "size-9 text-lg",
  lg: "size-14 text-3xl",
  xl: "size-20 text-5xl",
} as const;

/** The team's emoji on a disc ringed in the team color. */
export function TeamAvatar({
  team,
  size = "md",
  className,
}: {
  team: TeamLike;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const hex = teamColorHex(team.color);
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-full leading-none", sizes[size], className)}
      style={{
        background: `color-mix(in srgb, ${hex} 16%, var(--paper))`,
        boxShadow: `inset 0 0 0 2px ${hex}`,
      }}
    >
      {team.emoji}
    </span>
  );
}

/** Avatar + name. */
export function TeamBadge({
  team,
  size = "md",
  className,
  nameClassName,
}: {
  team: TeamLike;
  size?: keyof typeof sizes;
  className?: string;
  nameClassName?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <TeamAvatar team={team} size={size} />
      <span className={cn("truncate font-semibold", nameClassName)}>{team.name}</span>
    </span>
  );
}
