/*
 * Text helpers for organizer forms: team name lists, one-per-line fields and
 * answer patterns. Pure functions, shared by server actions and tests.
 */

import {
  cleanName as cleanTeamOrPlayerName,
  PLAYER_NAME_MAX as PLAYER_MAX,
  teamNameKey as playerTeamNameKey,
  TEAM_NAME_MAX as TEAM_MAX,
  TEAM_NAME_MIN as TEAM_MIN,
} from "@/lib/player/join";

// Team and player names follow the same rules as the player join flow, so a
// team an organizer adds and one a player creates can never collide.
export const TEAM_NAME_MIN = TEAM_MIN;
export const TEAM_NAME_MAX = TEAM_MAX;
export const PLAYER_NAME_MAX = PLAYER_MAX;

/** Display form of a name: control characters removed, single spaces, trimmed. */
export function cleanName(name: string): string {
  return cleanTeamOrPlayerName(name);
}

/** Case-insensitive key for team-name uniqueness within a hunt (teams.nameKey). */
export function teamNameKey(name: string): string {
  return playerTeamNameKey(name);
}

export type ParsedTeamNames = {
  /** Unique names in the order given. */
  names: string[];
  /** Names that appeared more than once in the list (reported once each). */
  repeated: string[];
  /** Names longer than TEAM_NAME_MAX. */
  tooLong: string[];
  /** Names shorter than TEAM_NAME_MIN. */
  tooShort: string[];
};

/** Parses a textarea with one team name per line. Blank lines are ignored. */
export function parseTeamNames(text: string): ParsedTeamNames {
  const names: string[] = [];
  const repeated: string[] = [];
  const tooLong: string[] = [];
  const tooShort: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const name = cleanName(raw);
    if (!name) continue;
    if (name.length > TEAM_NAME_MAX) {
      tooLong.push(name);
      continue;
    }
    if (name.length < TEAM_NAME_MIN) {
      tooShort.push(name);
      continue;
    }
    const key = teamNameKey(name);
    if (seen.has(key)) {
      if (!repeated.some((r) => teamNameKey(r) === key)) repeated.push(name);
      continue;
    }
    seen.add(key);
    names.push(name);
  }
  return { names, repeated, tooLong, tooShort };
}

/** Non-empty trimmed lines, without exact duplicates, in order. */
export function parseLines(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line && !out.includes(line)) out.push(line);
  }
  return out;
}

/**
 * Markdown to a short plain-text line, for push notifications and previews:
 * drops formatting marks, keeps link text, collapses whitespace.
 */
export function plainText(markdown: string, max = 180): string {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__|\*|_|~~)(\S(?:.*?\S)?)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Joins names for a sentence: "A", "A and B", "A, B and C". */
export function listSentence(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Wraps each item in typographic quotes. */
export function quoted(items: string[]): string[] {
  return items.map((s) => `“${s}”`);
}
