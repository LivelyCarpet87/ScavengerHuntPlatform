import type { Invite, StaffRole } from "@/lib/db/schema";

/*
 * Pure platform rules shared by the auth pages, the admin area and tests.
 * No database or framework imports here.
 */

// Redirect targets -------------------------------------------------------------

/** Pages that should never be the destination after signing in (they'd loop or make no sense). */
const AUTH_PATHS = ["/login", "/signup", "/setup"];

/**
 * Validates a `?next=` value: only same-site relative paths ("/manage/abc?x=1").
 * Anything else — absolute URLs, protocol-relative "//evil.com", backslash
 * tricks, control characters, auth pages — falls back.
 */
export function safeNext(input: unknown, fallback = "/dashboard"): string {
  if (typeof input !== "string") return fallback;
  const next = input.trim();
  if (!next.startsWith("/") || next.length > 1000) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  const path = next.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (AUTH_PATHS.includes(path)) return fallback;
  return next;
}

/** First value of a search param that may be repeated. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Invites ----------------------------------------------------------------------

export type InviteStatus = "active" | "revoked" | "expired" | "used";

export function inviteStatus(
  invite: Pick<Invite, "revokedAt" | "expiresAt" | "maxUses" | "uses">,
  now = new Date(),
): InviteStatus {
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) return "expired";
  if (invite.maxUses != null && invite.uses >= invite.maxUses) return "used";
  return "active";
}

/** Invite tokens are long random base62 strings; reject anything else before touching the database. */
export function isPlausibleToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{8,128}$/.test(token);
}

// Staff roles --------------------------------------------------------------------

const ROLE_RANK: Record<StaffRole, number> = { judge: 1, organizer: 2, owner: 3 };

/**
 * The role someone should end up with after accepting an invite for `offered`:
 * invites only ever upgrade. Returns null when nothing should change.
 */
export function upgradedRole(current: StaffRole | null | undefined, offered: StaffRole): StaffRole | null {
  if (!current) return offered;
  return ROLE_RANK[offered] > ROLE_RANK[current] ? offered : null;
}

/** "Alex invited you to judge …", "… to organize …", "… to co-own …" */
export const ROLE_VERB: Record<StaffRole, string> = {
  judge: "judge",
  organizer: "organize",
  owner: "co-own",
};

/** "You're already a judge on …" */
export const ROLE_NOUN: Record<StaffRole, string> = {
  judge: "a judge",
  organizer: "an organizer",
  owner: "an owner",
};

export const ROLE_DESCRIPTION: Record<StaffRole, string> = {
  judge:
    "Judges review photos, answers and contest entries as teams send them in, and can see the teams and the live scoreboard.",
  organizer:
    "Organizers edit tasks, teams, announcements and hunt settings, and judge submissions alongside the judges.",
  owner: "Owners can do everything organizers can, and also manage the hunt's staff and delete the hunt.",
};

// People -------------------------------------------------------------------------

/** "Alex Rivera" -> "Alex". Falls back to the full string for single names. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** "Alex Rivera" -> "AR", "sam" -> "S". Whole characters, so "Émile Zola" and emoji names work too. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const lead = (word: string) => Array.from(word)[0] ?? "";
  const first = lead(parts[0]);
  const last = parts.length > 1 ? lead(parts[parts.length - 1]) : "";
  return (first + last).toUpperCase();
}

// Invite link lifetimes ------------------------------------------------------------

export const INVITE_LIFETIMES = [
  { value: "1d", label: "In 24 hours", ms: 24 * 60 * 60 * 1000 },
  { value: "7d", label: "In 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { value: "30d", label: "In 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
  { value: "never", label: "Never", ms: null },
] as const;

export type InviteLifetime = (typeof INVITE_LIFETIMES)[number]["value"];

export function inviteExpiry(lifetime: InviteLifetime, now = new Date()): Date | null {
  const option = INVITE_LIFETIMES.find((o) => o.value === lifetime);
  return option?.ms ? new Date(now.getTime() + option.ms) : null;
}
