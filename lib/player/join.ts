/*
 * Joining a hunt: parsing what people type, paste or scan, the registration
 * rules, and the name limits shared by the join, invite and team pages.
 *
 * Client-safe and dependency-free: the code entry on the landing page and the
 * join and team forms import it, so it must not import zod (or anything with
 * a server or bundle cost). The zod form schemas live in ./join-schemas.ts.
 */

// ---------------------------------------------------------------------------
// Hunt codes, links and ?next=
// ---------------------------------------------------------------------------

export const HUNT_CODE_LENGTH = 6;

export type HuntInput =
  | { kind: "code"; code: string }
  /** A link into this app (same origin): navigate there instead. */
  | { kind: "path"; path: string }
  | { kind: "none" };

const JOIN_PATH = /\/join\/(\d{6})(?:[/?#]|$)/;
const SEPARATORS = /[\s\-._·‐-―]/g;

function looksLikeUrl(text: string): boolean {
  return !/\s/.test(text) && (text.includes("://") || /^[\w.-]+(:\d+)?\//.test(text));
}

function toUrl(text: string): URL | null {
  try {
    return new URL(text.includes("://") ? text : `https://${text}`);
  } catch {
    return null;
  }
}

/** Paths a scanned or pasted link may take someone to. */
export function isHuntPath(pathname: string): boolean {
  return /^\/(h|join)\/[^/]+/.test(pathname);
}

/**
 * Makes sense of whatever was typed, pasted or scanned into the hunt code box:
 * "482913", "482 913", "482-913", a join link (…/join/482913), a hunt link
 * carrying ?code=482913 — or, when `origin` matches, any link into a hunt on
 * this server, which the caller should simply open.
 */
export function parseHuntInput(raw: string, origin?: string | null): HuntInput {
  const text = raw.trim();
  if (!text) return { kind: "none" };
  if (looksLikeUrl(text)) {
    const url = toUrl(text);
    if (!url) return { kind: "none" };
    if (origin && url.origin === origin && isHuntPath(url.pathname)) {
      return { kind: "path", path: `${url.pathname}${url.search}` };
    }
    const fromPath = JOIN_PATH.exec(url.pathname)?.[1];
    if (fromPath) return { kind: "code", code: fromPath };
    const fromQuery = url.searchParams.get("code")?.replace(SEPARATORS, "");
    if (fromQuery && /^\d{6}$/.test(fromQuery)) return { kind: "code", code: fromQuery };
    return { kind: "none" };
  }
  const digits = text.replace(SEPARATORS, "");
  return /^\d{6}$/.test(digits) ? { kind: "code", code: digits } : { kind: "none" };
}

/** The six digits of a hunt code in any accepted spelling, or null. */
export function extractHuntCode(raw: string): string | null {
  const parsed = parseHuntInput(raw);
  return parsed.kind === "code" ? parsed.code : null;
}

/** Keeps only digits, up to six — for the code box while someone types. */
export function sanitizeCodeTyping(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, HUNT_CODE_LENGTH);
}

/**
 * Where to send someone after joining, from ?next= (e.g. the checkpoint they
 * scanned before they had a team). Only paths inside the same hunt count;
 * anything else is ignored.
 */
export function safeNextPath(next: unknown, slug: string): string | null {
  if (typeof next !== "string" || next.length > 300) return null;
  if (!/^[\x21-\x7e]+$/.test(next)) return null;
  const base = `/h/${slug}`;
  if (next !== base && !next.startsWith(`${base}/`) && !next.startsWith(`${base}?`)) return null;
  if (next.includes("//") || next.includes("\\") || next.includes("..")) return null;
  return next;
}

// ---------------------------------------------------------------------------
// Registration rules
// ---------------------------------------------------------------------------

export type JoinPhase = "draft" | "archived" | "upcoming" | "live" | "ended";

export type JoinPolicy = {
  /** Why nobody can join at all right now, or null. */
  closed: string | null;
  /** Joining an existing team with its team code. */
  canJoinTeam: boolean;
  /** Starting a new team. */
  canCreateTeam: boolean;
  /** Why starting a team isn't possible (shown instead of the form). */
  createNote: string | null;
  /** Starting a team needs the hunt code (joinMode "code"). */
  needsHuntCode: boolean;
};

/**
 * Who may join, per the hunt's settings:
 *  - finished hunts are closed;
 *  - registrationOpen=false stops new teams, but team codes keep working;
 *  - teamCreation="organizers" means players only join existing teams;
 *  - joinMode="code" requires the hunt code to start a team;
 *  - drafts are visible to staff only; they can join existing (test) teams.
 */
export function joinPolicy(
  hunt: { teamCreation: "players" | "organizers"; registrationOpen: boolean; joinMode: "code" | "open" },
  phase: JoinPhase,
): JoinPolicy {
  if (phase === "ended" || phase === "archived") {
    return {
      closed: "This hunt has finished, so teams can’t join any more.",
      canJoinTeam: false,
      canCreateTeam: false,
      createNote: null,
      needsHuntCode: false,
    };
  }
  let createNote: string | null = null;
  if (phase === "draft") createNote = "Teams can register once the hunt is published.";
  else if (hunt.teamCreation === "organizers")
    createNote = "The organizers set up the teams for this hunt. Ask your captain or an organizer for your team code.";
  else if (!hunt.registrationOpen)
    createNote = "Registration is closed. Already on a team? Join it with your team code.";
  return {
    closed: null,
    canJoinTeam: true,
    canCreateTeam: createNote == null,
    createNote,
    needsHuntCode: hunt.joinMode === "code",
  };
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** Trims, strips control characters and collapses runs of spaces. */
export function cleanName(input: string): string {
  return input
    .normalize("NFC")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Case-insensitive key for team-name uniqueness within a hunt (teams.nameKey). */
export function teamNameKey(name: string): string {
  return cleanName(name).normalize("NFKC").toLowerCase();
}

export const TEAM_NAME_MIN = 2;
export const TEAM_NAME_MAX = 32;
export const PLAYER_NAME_MAX = 24;

/** Alternatives to offer when a team name is taken: "Night Owls 2", "Night Owls 3", … */
export function teamNameCandidates(name: string): string[] {
  const base = cleanName(name);
  return Array.from({ length: 8 }, (_, i) => {
    const suffix = ` ${i + 2}`;
    return `${base.slice(0, TEAM_NAME_MAX - suffix.length).trimEnd()}${suffix}`;
  });
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

/** Midnight (UTC ms) of the calendar day `date` falls on in `timeZone`. */
function dayIndex(date: Date, timeZone: string): number {
  const parts: Record<string, number> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

/**
 * Calendar days until `at` in the hunt's time zone, the way people count
 * them: on a Sunday evening, a Tuesday start is "2 days to go" even though
 * fewer than 48 hours remain.
 */
export function daysUntil(at: Date, now: Date, timeZone: string): number {
  return Math.round((dayIndex(at, timeZone) - dayIndex(now, timeZone)) / 86_400_000);
}

/** Formats a hunt code for display: "482913" → "482 913". */
export function formatHuntCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}
