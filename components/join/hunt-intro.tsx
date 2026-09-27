import { Eye, FilePenLine, Settings2 } from "lucide-react";
import Link from "next/link";
import { RefreshAt } from "@/components/home/refresh-at";
import { ButtonLink } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { Notice } from "@/components/ui/misc";
import type { Hunt, StaffRole } from "@/lib/db/schema";
import { canViewGallery, canViewScoreboard, huntPhase } from "@/lib/hunts";
import { extractHuntCode, joinPolicy, safeNextPath } from "@/lib/player/join";
import { codeGuard, countListedTasks, getHuntCover, pickTeamLook } from "@/lib/player/queries";
import { links } from "@/lib/url";
import { FormerTeamNotice } from "./former-team-notice";
import { HuntHero } from "./hunt-hero";
import type { HuntCodeMode } from "./join-forms";
import { JoinPanel } from "./join-panel";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * /h/[slug] for visitors who haven't joined: the hunt's map and legend, how
 * to join (as the registration rules allow), and the organizer's intro.
 */
export async function HuntIntro({
  hunt,
  staffRole,
  searchParams,
}: {
  hunt: Hunt;
  staffRole: StaffRole | null;
  searchParams: SearchParams;
}) {
  const now = new Date();
  const phase = huntPhase(hunt, now);
  const policy = joinPolicy(hunt, phase);
  const viewer = { isStaff: !!staffRole, isPlayer: false };
  const [controls, cover, look] = await Promise.all([
    countListedTasks(hunt.id),
    getHuntCover(hunt),
    pickTeamLook(hunt.id),
  ]);

  const next = safeNextPath(first(searchParams.next), hunt.slug);
  const huntCode = await huntCodeMode(hunt, policy.needsHuntCode, first(searchParams.code));
  const showScoreboard = canViewScoreboard(hunt, viewer);
  const showGallery = canViewGallery(hunt, viewer, now);
  const open = !policy.closed;

  return (
    <div className="flex flex-col gap-10">
      <RefreshAt
        at={[hunt.startsAt?.getTime(), hunt.endsAt?.getTime(), hunt.startsAt && hunt.startsAt.getTime() - 86_400_000]}
      />
      <div className="flex flex-col gap-4">
        {open ? <FormerTeamNotice huntId={hunt.id} /> : null}
        {hunt.status === "draft" ? (
          <Notice
            tone="warning"
            icon={<FilePenLine className="size-4" />}
            title="This hunt is a draft. Only staff can see this page."
          >
            Publish it from the organizer view.{" "}
            <Link href={links.manage(hunt.id)} className="font-semibold text-ink underline underline-offset-2">
              Open the organizer view
            </Link>
          </Notice>
        ) : staffRole ? (
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <Settings2 aria-hidden className="size-4 shrink-0" />
            <span>
              You’re staff on this hunt.{" "}
              <Link href={links.manage(hunt.id)} className="font-semibold text-ink underline underline-offset-2">
                Open the organizer view
              </Link>
            </span>
          </p>
        ) : null}

        <HuntHero hunt={hunt} phase={phase} controls={controls} cover={cover} now={now.getTime()} />
      </div>

      {open ? (
        <JoinPanel
          huntId={hunt.id}
          policy={policy}
          look={look}
          huntCode={huntCode}
          maxTeamSize={hunt.maxTeamSize}
          next={next}
        />
      ) : (
        <section aria-labelledby="finished" className="flex flex-col items-start gap-3">
          <h2 id="finished" className="font-cond text-3xl font-extrabold tracking-tight">
            {showScoreboard ? "The results are in" : "Joining is closed"}
          </h2>
          <p className="max-w-prose text-ink-2">
            {showScoreboard
              ? "Teams can’t join any more, but you can see how every team did."
              : "Teams can’t join any more. The organizers will share the results."}
          </p>
          {showScoreboard || showGallery ? (
            <div className="mt-1 flex flex-wrap gap-2">
              {showScoreboard ? (
                <ButtonLink href={links.scoreboard(hunt.slug)}>See the final scoreboard</ButtonLink>
              ) : null}
              {showGallery ? (
                <ButtonLink href={`/h/${hunt.slug}/gallery`} variant="secondary">
                  Browse the photos
                </ButtonLink>
              ) : null}
            </div>
          ) : null}
        </section>
      )}

      {open && phase === "live" && showScoreboard ? (
        <p className="-mt-4 flex items-center gap-2 text-sm text-ink-2">
          <Eye aria-hidden className="size-4 shrink-0" />
          <span>
            Just watching?{" "}
            <Link href={links.scoreboard(hunt.slug)} className="font-semibold text-ink underline underline-offset-2">
              Follow the live scoreboard
            </Link>
          </span>
        </p>
      ) : null}

      {hunt.description.trim() ? (
        <section aria-labelledby="about" className="border-t border-line pt-8">
          <h2 id="about" className="mb-3 font-cond text-2xl font-bold tracking-tight">
            About this hunt
          </h2>
          <Markdown className="max-w-prose">{hunt.description}</Markdown>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Whether starting a team needs the hunt code, and if so whether the link
 * already carried the right one (?code=…). Wrong codes count toward the
 * network's guessing limit, so the page can't be used to try codes; once a
 * network is over it, the code is simply asked for again.
 */
async function huntCodeMode(hunt: Hunt, needed: boolean, param: string | undefined): Promise<HuntCodeMode> {
  if (!needed) return { mode: "none" };
  if (!param) return { mode: "ask" };
  const guard = await codeGuard("hunt");
  if (guard.retryAfterSec) return { mode: "ask" };
  if (extractHuntCode(param) === hunt.joinCode) return { mode: "carried", code: hunt.joinCode };
  guard.miss();
  return {
    mode: "ask",
    initial: param,
    error: "That code doesn’t match this hunt. Check the six digits on the poster.",
  };
}
