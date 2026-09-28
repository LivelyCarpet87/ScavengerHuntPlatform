import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BigScreen, type ScreenJoin } from "@/components/screen/big-screen";
import { ScreenLocked } from "@/components/screen/screen-locked";
import { ContourArt } from "@/components/ui/contour-art";
import { QrCode } from "@/components/ui/qr-code";
import { getHuntBySlug, huntPhase } from "@/lib/hunts";
import { formatCode } from "@/lib/ids";
import { loadFeed } from "@/lib/live/feed";
import { loadStandings } from "@/lib/live/standings";
import { canSeeBoard, getLiveViewer, ROOM } from "@/lib/live/viewer";
import { absoluteUrl, links } from "@/lib/url";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const hunt = await getHuntBySlug(slug);
  if (!hunt || hunt.status === "draft") return {};
  return { title: `${hunt.name} big screen`, robots: { index: false } };
}

/** The projector at event HQ. Night-O by default; `?theme=light` for bright rooms (see the layout). */
export default async function ScreenPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hunt = await getHuntBySlug(slug);
  if (!hunt) notFound();
  const viewer = await getLiveViewer(hunt.id);
  if (hunt.status === "draft" && !viewer.isStaff) notFound();

  if (!canSeeBoard(hunt, viewer)) {
    return <ScreenLocked hunt={hunt} signedInAsPlayer={viewer.isPlayer} />;
  }

  // The room sees what players see: frozen standings, no hidden teams, and
  // photos only when the gallery is open to players — even when staff open it.
  const now = new Date();
  const [{ payload: standings }, feed] = await Promise.all([
    loadStandings(hunt, ROOM, now),
    loadFeed(hunt, ROOM, { limit: 40, now }),
  ]);

  const phase = huntPhase(hunt, now);
  // Only while scanning actually lets a new team register: with organizer-made
  // teams, players need their team code (or team QR card) instead.
  let join: ScreenJoin | null = null;
  if (hunt.registrationOpen && hunt.teamCreation === "players" && (phase === "upcoming" || phase === "live")) {
    const url = await absoluteUrl(links.join(hunt.joinCode));
    join = {
      url,
      display: url.replace(/^https?:\/\//, ""),
      code: formatCode(hunt.joinCode),
      qr: <QrCode value={url} size={320} quiet={3} label={`QR code to join ${hunt.name}`} className="h-auto w-full" />,
    };
  }

  return (
    <BigScreen
      hunt={{
        id: hunt.id,
        name: hunt.name,
        accent: hunt.accent,
        timezone: hunt.timezone,
        freezeAt: hunt.freezeAt ? hunt.freezeAt.toISOString() : null,
      }}
      initialStandings={standings}
      initialFeed={feed}
      join={join}
      backdrop={<ContourArt seed={hunt.id} strength="faint" />}
      serverNow={now.getTime()}
    />
  );
}
