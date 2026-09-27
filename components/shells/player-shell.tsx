import Link from "next/link";
import type { ReactNode } from "react";
import { PlayerLive } from "@/components/live/player-live";
import { QueueFlusher } from "@/components/task/queue-flusher";
import { StartMark } from "@/components/ui/control";
import { TeamAvatar } from "@/components/ui/team-badge";
import type { Hunt, Team } from "@/lib/db/schema";
import { huntPhase } from "@/lib/hunts";
import { HeaderClock } from "./header-clock";
import { PlayerBottomNav, PlayerTopTabs } from "./player-nav";

/**
 * Frame for every player-facing hunt page (/h/[slug]/…): hunt name and clock
 * on top, tabs at the bottom on phones (in the header on wider screens).
 * Sets the hunt's accent for everything inside.
 */
export function PlayerShell({
  hunt,
  team,
  unread = 0,
  children,
}: {
  hunt: Pick<Hunt, "id" | "name" | "slug" | "accent" | "status" | "startsAt" | "endsAt">;
  /** The viewer's team; null for visitors who haven't joined (no tab bar). */
  team?: Pick<Team, "id" | "name" | "emoji" | "color"> | null;
  unread?: number;
  children: ReactNode;
}) {
  const now = Date.now();
  const phase = huntPhase(hunt);
  return (
    <div data-accent={hunt.accent} className="min-h-dvh bg-paper">
      <header className="sticky top-(--banner-h) z-40 border-b border-line bg-paper/92 pt-safe backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link href={`/h/${hunt.slug}`} className="flex min-w-0 items-center gap-2.5">
            <StartMark size={20} />
            <span className="truncate font-cond text-lg font-extrabold tracking-tight">{hunt.name}</span>
          </Link>
          {team ? (
            <div className="ml-auto flex items-center gap-4">
              <PlayerTopTabs slug={hunt.slug} unread={unread} />
              {phase === "live" && hunt.endsAt ? (
                <HeaderClock slug={hunt.slug} endsAt={hunt.endsAt.getTime()} serverNow={now} />
              ) : null}
              <Link href={`/h/${hunt.slug}/team`} aria-label={`Team ${team.name}`}>
                <TeamAvatar team={team} size="sm" />
              </Link>
            </div>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-5 pb-28 md:pb-16">
        {team ? <QueueFlusher huntId={hunt.id} slug={hunt.slug} /> : null}
        {children}
      </main>
      {team ? <PlayerBottomNav slug={hunt.slug} unread={unread} /> : null}
      {team ? <PlayerLive huntId={hunt.id} teamId={team.id} /> : null}
    </div>
  );
}
