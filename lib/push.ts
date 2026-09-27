import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import webpush from "web-push";
import { db } from "@/lib/db";
import { huntStaff, players, pushSubscriptions, sessions, settings } from "@/lib/db/schema";
import { env } from "@/lib/env";

/*
 * Web Push. VAPID keys come from the environment, or are generated on first
 * use and stored in the settings table, so push works with zero setup.
 *
 * Senders are fire-and-forget: call them inside `after()` from next/server so
 * a slow push service never delays the response.
 *
 *   after(() => notifyTeam(teamId, { title: "Accepted", body: "…", url: "/h/…" }))
 */

export type PushPayload = {
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url?: string;
  /** Notifications with the same tag replace each other on the device. */
  tag?: string;
};

type Keys = { publicKey: string; privateKey: string };
type PushGlobal = { __shpVapid?: Promise<Keys> };
const g = globalThis as PushGlobal;

async function loadKeys(): Promise<Keys> {
  if (env.vapid.publicKey && env.vapid.privateKey) {
    return { publicKey: env.vapid.publicKey, privateKey: env.vapid.privateKey };
  }
  const existing = await db.select().from(settings).where(eq(settings.key, "vapid")).get();
  if (existing?.value) return existing.value as Keys;
  const generated = webpush.generateVAPIDKeys();
  await db.insert(settings).values({ key: "vapid", value: generated }).onConflictDoNothing();
  const stored = await db.select().from(settings).where(eq(settings.key, "vapid")).get();
  return (stored?.value as Keys) ?? generated;
}

function vapidKeys(): Promise<Keys> {
  g.__shpVapid ??= loadKeys().catch((err) => {
    g.__shpVapid = undefined;
    throw err;
  });
  return g.__shpVapid;
}

/** Public key the browser needs for pushManager.subscribe(). */
export async function getVapidPublicKey(): Promise<string> {
  return (await vapidKeys()).publicKey;
}

/** Stores (or re-assigns) a browser subscription for a device session. */
export async function saveSubscription(
  sessionId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({ sessionId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { sessionId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, failures: 0 },
    });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

async function sendToSessions(sessionIds: string[], payload: PushPayload): Promise<void> {
  const unique = [...new Set(sessionIds)];
  if (unique.length === 0) return;
  const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.sessionId, unique));
  if (subs.length === 0) return;
  const keys = await vapidKeys();
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
          TTL: 60 * 60,
          urgency: "high",
          vapidDetails: { subject: env.vapid.subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
        });
        if (sub.failures > 0) {
          await db.update(pushSubscriptions).set({ failures: 0 }).where(eq(pushSubscriptions.id, sub.id));
        }
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410 || sub.failures >= 5) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        } else {
          await db
            .update(pushSubscriptions)
            .set({ failures: sub.failures + 1 })
            .where(eq(pushSubscriptions.id, sub.id));
        }
      }
    }),
  );
}

/** Every device signed in as a member of the team. */
export async function notifyTeam(teamId: string, payload: PushPayload): Promise<void> {
  const rows = await db
    .select({ sessionId: players.sessionId })
    .from(players)
    .where(and(eq(players.teamId, teamId), isNotNull(players.sessionId)));
  await sendToSessions(
    rows.map((r) => r.sessionId as string),
    payload,
  );
}

/** Every player device in the hunt. */
export async function notifyHuntPlayers(huntId: string, payload: PushPayload): Promise<void> {
  const rows = await db
    .select({ sessionId: players.sessionId })
    .from(players)
    .where(and(eq(players.huntId, huntId), isNotNull(players.sessionId)));
  await sendToSessions(
    rows.map((r) => r.sessionId as string),
    payload,
  );
}

/** Every device where a staff member of the hunt is signed in. */
export async function notifyHuntStaff(huntId: string, payload: PushPayload): Promise<void> {
  const rows = await db
    .select({ sessionId: sessions.id })
    .from(huntStaff)
    .innerJoin(sessions, eq(sessions.userId, huntStaff.userId))
    .where(eq(huntStaff.huntId, huntId));
  await sendToSessions(
    rows.map((r) => r.sessionId),
    payload,
  );
}
