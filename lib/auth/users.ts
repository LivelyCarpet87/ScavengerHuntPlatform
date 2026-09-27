import "server-only";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { type Db, db } from "@/lib/db";
import { sessions, type User, users } from "@/lib/db/schema";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password";

/*
 * Staff accounts (organizers, judges, platform admins). Players never have
 * accounts — see lib/auth/session.ts.
 */

// Field schemas, shared by setup, signup, login and the admin area -------------

export const PASSWORD_MIN = 10;

export const nameField = z
  .string({ message: "Enter your name." })
  .trim()
  .min(1, "Enter your name.")
  .max(80, "Names can be up to 80 characters.");

export const emailField = z
  .string({ message: "Enter your email address." })
  .trim()
  .min(1, "Enter your email address.")
  .toLowerCase()
  .pipe(z.email("Enter a valid email address, like sam@example.com.").max(254, "That email address is too long."));

export const newPasswordField = z
  .string({ message: "Choose a password." })
  .min(1, "Choose a password.")
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(256, "Passwords can be up to 256 characters.");

/** Lowercased, trimmed — the form stored in users.email. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Queries ----------------------------------------------------------------------

/** True once the first account exists (first-run setup is done). */
export async function hasAnyUser(): Promise<boolean> {
  const row = await db.select({ id: users.id }).from(users).limit(1).get();
  return !!row;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return (
    (await db
      .select()
      .from(users)
      .where(eq(users.email, normalizeEmail(email)))
      .get()) ?? null
  );
}

export async function getUserById(id: string): Promise<User | null> {
  return (await db.select().from(users).where(eq(users.id, id)).get()) ?? null;
}

export async function countAdmins(tx: Pick<Db, "select"> = db): Promise<number> {
  const row = await tx.select({ n: count() }).from(users).where(eq(users.isAdmin, true)).get();
  return row?.n ?? 0;
}

// Mutations --------------------------------------------------------------------

export class EmailTakenError extends Error {
  constructor() {
    super("There's already an account with this email.");
    this.name = "EmailTakenError";
  }
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  const text = `${e?.code ?? ""} ${e?.message ?? ""} ${e?.cause?.code ?? ""} ${e?.cause?.message ?? ""}`;
  return text.includes("SQLITE_CONSTRAINT") || text.includes("UNIQUE constraint failed");
}

/**
 * Creates an account. Hash the password first (it's slow) and pass
 * `passwordHash`, so callers can do this inside a short write transaction.
 * Throws EmailTakenError when the email is in use.
 */
export async function insertUser(
  input: { name: string; email: string; passwordHash: string; isAdmin?: boolean },
  tx: Pick<Db, "select" | "insert"> = db,
): Promise<User> {
  const email = normalizeEmail(input.email);
  const existing = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (existing) throw new EmailTakenError();
  try {
    const [user] = await tx
      .insert(users)
      .values({ name: input.name.trim(), email, passwordHash: input.passwordHash, isAdmin: input.isAdmin ?? false })
      .returning();
    return user;
  } catch (err) {
    if (isUniqueViolation(err)) throw new EmailTakenError();
    throw err;
  }
}

/**
 * First-run setup: creates the first account as a platform admin, or returns
 * null when any account already exists. The check and the insert share one
 * write transaction, so two simultaneous setups can't both succeed.
 */
export async function createFirstAdmin(
  input: { name: string; email: string; passwordHash: string },
  database: Pick<Db, "transaction"> = db,
): Promise<User | null> {
  return database.transaction(async (tx) => {
    const existing = await tx.select({ id: users.id }).from(users).limit(1).get();
    if (existing) return null;
    return insertUser({ ...input, isAdmin: true }, tx);
  });
}

/** Convenience for one-off account creation outside a transaction. */
export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  isAdmin?: boolean;
}): Promise<User> {
  const passwordHash = await hashPassword(input.password);
  return insertUser({ name: input.name, email: input.email, passwordHash, isAdmin: input.isAdmin });
}

/**
 * Checks an email + password. Takes the same time whether or not the email
 * exists (unknown emails are checked against a dummy hash), so response
 * timing doesn't reveal which emails have accounts.
 */
export async function verifyCredentials(email: string, password: string): Promise<User | null> {
  const user = await getUserByEmail(email);
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  return user && ok ? user : null;
}

/**
 * Sets a new password and signs the account out on every device except
 * `keepSessionId` (the admin's own device when they reset their own password).
 * Player memberships on those devices are kept.
 */
export async function setUserPassword(userId: string, password: string, keepSessionId?: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  await db
    .update(sessions)
    .set({ userId: null })
    .where(
      keepSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)) : eq(sessions.userId, userId),
    );
}
