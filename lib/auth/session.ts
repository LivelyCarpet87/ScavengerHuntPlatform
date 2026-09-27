import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { type Session, sessions, type User, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { newToken } from "@/lib/ids";

/*
 * One session per device. The cookie holds a random token; the database only
 * stores its sha256. Players attach to a session per hunt (players.session_id),
 * and a staff sign-in attaches a user to the same session, so a phone can be
 * both a judge and a player without juggling accounts.
 */

export const SESSION_COOKIE = "shp_session";
const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

export type CurrentSession = { session: Session; user: User | null };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * The current device session, or null. Read-only (never sets cookies), so it
 * is safe to call from Server Components. Memoized per request.
 */
export const getSession = cache(async (): Promise<CurrentSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .leftJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .get();
  if (!row || row.session.expiresAt.getTime() < Date.now()) return null;
  return { session: row.session, user: row.user };
});

/** The signed-in staff user on this device, or null. */
export async function getCurrentUser(): Promise<User | null> {
  return (await getSession())?.user ?? null;
}

async function writeCookie(token: string, expiresAt: Date) {
  const h = await headers();
  const secure = env.cookieSecure || h.get("x-forwarded-proto") === "https";
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Returns this device's session, creating one if needed. Sliding expiry is
 * refreshed at most once a day. Only call from Server Actions or Route
 * Handlers — it may set a cookie.
 */
export async function ensureSession(): Promise<Session> {
  const current = await getSession();
  const now = Date.now();
  if (current) {
    if (now - current.session.lastSeenAt.getTime() > REFRESH_AFTER_MS) {
      const expiresAt = new Date(now + SESSION_TTL_MS);
      await db
        .update(sessions)
        .set({ lastSeenAt: new Date(now), expiresAt })
        .where(eq(sessions.id, current.session.id));
      // The token is unchanged; re-set the cookie so its expiry slides too.
      const token = (await cookies()).get(SESSION_COOKIE)?.value;
      if (token) await writeCookie(token, expiresAt);
    }
    return current.session;
  }
  const token = newToken(40);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  const [session] = await db
    .insert(sessions)
    .values({ tokenHash: hashToken(token), userAgent, expiresAt: new Date(now + SESSION_TTL_MS) })
    .returning();
  await writeCookie(token, session.expiresAt);
  return session;
}

/**
 * Attaches a staff user to this device's session. The token is rotated (no
 * session fixation) but the session row is kept, so hunts this device has
 * joined as a player stay joined.
 */
export async function signInUser(userId: string): Promise<void> {
  const current = await getSession();
  const token = newToken(40);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  if (current) {
    await db
      .update(sessions)
      .set({ tokenHash: hashToken(token), userId, expiresAt, lastSeenAt: new Date() })
      .where(eq(sessions.id, current.session.id));
  } else {
    const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
    await db.insert(sessions).values({ tokenHash: hashToken(token), userId, userAgent, expiresAt });
  }
  await writeCookie(token, expiresAt);
}

/** Detaches the staff user from this device. Player memberships are kept. */
export async function signOutUser(): Promise<void> {
  const current = await getSession();
  if (!current) return;
  const token = newToken(40);
  await db
    .update(sessions)
    .set({ tokenHash: hashToken(token), userId: null })
    .where(eq(sessions.id, current.session.id));
  await writeCookie(token, current.session.expiresAt);
}
