import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";

/** A device normally holds one subscription; keep a few for browsers that rotate them. */
const MAX_PER_SESSION = 5;

/** Removes a subscription only if it belongs to this device session. Returns how many rows went. */
export async function removeSessionSubscription(sessionId: string, endpoint: string): Promise<number> {
  const removed = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.sessionId, sessionId)))
    .returning({ id: pushSubscriptions.id });
  return removed.length;
}

/** Drops the oldest subscriptions of a session beyond MAX_PER_SESSION. */
export async function pruneSessionSubscriptions(sessionId: string): Promise<void> {
  const rows = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.sessionId, sessionId))
    .orderBy(desc(pushSubscriptions.createdAt));
  const stale = rows.slice(MAX_PER_SESSION).map((r) => r.id);
  if (stale.length > 0) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, stale));
}
