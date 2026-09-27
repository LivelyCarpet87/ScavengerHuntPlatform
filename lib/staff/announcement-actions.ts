"use server";

import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { type ActionState, fail, ok, parseForm, zCheckbox } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { announcements, players } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { notifyHuntPlayers } from "@/lib/push";
import { publish } from "@/lib/realtime/bus";
import { revalidateHunt } from "./batch";
import { plainText } from "./text";
import { zId, zOptText, zText } from "./zod";

/*
 * Announcements reach every player: live in the app (announcement.created
 * shows a toast and refreshes Updates) and as a push notification on devices
 * that turned notifications on.
 */

const CreateSchema = z.object({
  huntId: zId,
  title: zOptText("the title", 80),
  body: zText("a message", { max: 2000 }),
  pinned: zCheckbox,
});

export async function createAnnouncementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(CreateSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const { user, hunt } = await requireStaff(d.huntId, "organizer");
  const id = newId();
  await db.insert(announcements).values({
    id,
    huntId: hunt.id,
    title: d.title,
    body: d.body.trim(),
    pinned: d.pinned,
    createdBy: user.id,
  });
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "announcement.create",
    targetKind: "announcement",
    targetId: id,
    data: { title: d.title, pinned: d.pinned },
  });
  publish(hunt.id, { type: "announcement.created", announcementId: id, title: d.title, body: plainText(d.body, 280) });
  after(() =>
    notifyHuntPlayers(hunt.id, {
      title: d.title || hunt.name,
      body: plainText(d.body),
      url: `/h/${hunt.slug}/updates`,
      tag: `announcement-${id}`,
    }),
  );
  revalidateHunt(hunt.id);
  const anyone = await db.select({ id: players.id }).from(players).where(eq(players.huntId, hunt.id)).limit(1).get();
  return ok(anyone ? "Sent to all players." : "Posted. Players will find it in Updates when they join.");
}

const PinSchema = z.object({ huntId: zId, announcementId: zId, pinned: zCheckbox });

export async function setAnnouncementPinnedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(PinSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const { user, hunt } = await requireStaff(d.huntId, "organizer");
  const row = await db
    .select({ id: announcements.id })
    .from(announcements)
    .where(and(eq(announcements.id, d.announcementId), eq(announcements.huntId, hunt.id)))
    .get();
  if (!row) return fail("This announcement no longer exists. Reload the page.");
  await db
    .update(announcements)
    .set({ pinned: d.pinned })
    .where(and(eq(announcements.id, row.id), eq(announcements.huntId, hunt.id)));
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: d.pinned ? "announcement.pin" : "announcement.unpin",
    targetKind: "announcement",
    targetId: row.id,
  });
  // Players' Updates lists re-render on hunt.changed.
  publish(hunt.id, { type: "hunt.changed" });
  revalidateHunt(hunt.id);
  return ok(d.pinned ? "Pinned to the top of Updates." : "Unpinned.");
}

const DeleteSchema = z.object({ huntId: zId, announcementId: zId });

export async function deleteAnnouncementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(DeleteSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const { user, hunt } = await requireStaff(d.huntId, "organizer");
  const row = await db
    .select({ id: announcements.id, title: announcements.title })
    .from(announcements)
    .where(and(eq(announcements.id, d.announcementId), eq(announcements.huntId, hunt.id)))
    .get();
  if (!row) return ok("Announcement deleted.");
  await db.delete(announcements).where(and(eq(announcements.id, row.id), eq(announcements.huntId, hunt.id)));
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "announcement.delete",
    targetKind: "announcement",
    targetId: row.id,
    data: { title: row.title },
  });
  publish(hunt.id, { type: "hunt.changed" });
  revalidateHunt(hunt.id);
  return ok("Announcement deleted.");
}
