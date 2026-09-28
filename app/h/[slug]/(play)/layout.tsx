import type { ReactNode } from "react";
import { PlayerShell } from "@/components/shells/player-shell";
import { getPlayerHunt } from "@/lib/auth/access";
import { countUnread } from "@/lib/updates";

/** Player-facing hunt pages. The big screen (/h/[slug]/screen) lives outside this group. */
export default async function PlayLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { hunt, me } = await getPlayerHunt(slug);
  const unread = me ? await countUnread(me.player) : 0;
  return (
    <PlayerShell hunt={hunt} team={me?.team ?? null} unread={unread}>
      {children}
    </PlayerShell>
  );
}
