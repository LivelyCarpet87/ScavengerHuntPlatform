import { ButtonLink } from "@/components/ui/button";
import { ContourArt } from "@/components/ui/contour-art";
import { LogoMark } from "@/components/ui/control";
import type { Hunt } from "@/lib/db/schema";
import { links } from "@/lib/url";

/** The big screen for someone who may not see this hunt's scoreboard. */
export function ScreenLocked({
  hunt,
  signedInAsPlayer,
}: {
  hunt: Pick<Hunt, "id" | "name" | "slug" | "scoreboardVisibility" | "accent">;
  signedInAsPlayer: boolean;
}) {
  const next = encodeURIComponent(links.screen(hunt.slug));
  const forPlayers = hunt.scoreboardVisibility === "players";
  return (
    <main
      data-accent={hunt.accent}
      className="relative grid min-h-dvh place-items-center overflow-hidden bg-paper px-6"
    >
      <ContourArt seed={hunt.id} strength="faint" />
      <div className="relative w-full max-w-xl rounded-xl border border-line bg-paper p-8">
        <LogoMark size={40} />
        <p className="mt-6 text-ink-2">{hunt.name}</p>
        <h1 className="mt-1 font-cond text-4xl font-extrabold tracking-tight">
          {forPlayers ? "This scoreboard is for teams in the hunt" : "Only the hunt’s staff can open the big screen"}
        </h1>
        <p className="mt-3 text-lg text-ink-2">
          {forPlayers
            ? "Open this page on a device that has joined a team, or sign in with a staff account."
            : signedInAsPlayer
              ? "The organizers keep scores private during this hunt. Sign in with a staff account to show them."
              : "Sign in with the staff account for this hunt, then open this page again."}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <ButtonLink href={`/login?next=${next}`}>Sign in as staff</ButtonLink>
          {forPlayers ? (
            <ButtonLink href={links.hunt(hunt.slug)} variant="secondary">
              Join this hunt
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </main>
  );
}
