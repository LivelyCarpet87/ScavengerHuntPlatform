/**
 * Answer checking for "answer" tasks.
 *
 * Pure functions with no database or framework imports, so the same rules run
 * in the upload API, in tests (`bun test lib/judging`) and in any organizer
 * preview. Three modes, chosen per task (tasks.answerMatch):
 *
 *   loose  forgiving equality: case, accents, extra spaces, surrounding
 *          punctuation/quotes, phone "smart" punctuation and a leading
 *          "the"/"a"/"an" are ignored — "The Gargoyle!" matches "gargoyle"
 *   exact  trimmed, case-sensitive equality
 *   regex  each accepted answer is a case-insensitive pattern that must match
 *          the whole input — "colou?r" matches "Colour" but not "colours"
 *
 * Safety: inputs longer than MAX_ANSWER_INPUT never match, and regex patterns
 * that are invalid, longer than MAX_ANSWER_PATTERN or prone to catastrophic
 * backtracking never match (see regexAnswerError, which the task editor can
 * use to explain the problem to organizers before saving).
 */

export type AnswerMatchMode = "loose" | "exact" | "regex";

/** Longest input that can match. Anything longer is treated as a wrong answer. */
export const MAX_ANSWER_INPUT = 500;
/** Longest regex pattern that is ever compiled. */
export const MAX_ANSWER_PATTERN = 200;

// Phones type "smart" punctuation: O’Brien, “quoted”, en–dash. Fold them to ASCII.
const SINGLE_QUOTES = /[‘’‚‛′`´]/g;
const DOUBLE_QUOTES = /[“”„‟″]/g;
const DASHES = /[‐-―−]/g;
const COMBINING_MARKS = /\p{M}+/gu;
const WHITESPACE = /\s+/gu;
const EDGE_PUNCTUATION = /^[\p{P}\s]+|[\p{P}\s]+$/gu;
const LEADING_ARTICLE = /^(?:the|an|a) (?=\S)/;

/**
 * Canonical form used by loose matching: accents and case removed (with full
 * case folding, so "STRASSE" equals "straße"), whitespace collapsed, and
 * punctuation or quotes around the answer stripped.
 *
 *   normalizeAnswer("  “Crème  Brûlée!” ") === "creme brulee"
 */
export function normalizeAnswer(input: string): string {
  return input
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, "-")
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toUpperCase()
    .toLowerCase()
    .replace(WHITESPACE, " ")
    .replace(EDGE_PUNCTUATION, "");
}

function withoutArticle(normalized: string): string {
  return normalized.replace(LEADING_ARTICLE, "");
}

/**
 * Why a regex answer pattern can't be used, as an organizer-facing sentence,
 * or null when it's fine. Patterns with an error never match.
 */
export function regexAnswerError(pattern: string): string | null {
  if (pattern.trim() === "") return "Enter a pattern.";
  if (pattern.length > MAX_ANSWER_PATTERN) {
    return `Patterns can be up to ${MAX_ANSWER_PATTERN} characters.`;
  }
  try {
    new RegExp(pattern, "i");
  } catch {
    return "That isn't a valid regular expression. Check brackets and backslashes.";
  }
  if (hasNestedQuantifier(pattern)) {
    return "That pattern could take too long to check. Avoid repeating a group that repeats or has alternatives, like (a+)+ or (a|b)+ — a character class like [ab]+ works instead.";
  }
  return null;
}

/**
 * Detects a quantified group that itself contains a quantifier or an
 * alternation — (a+)+, (\w+\s?)*, (x{2,})+, (\d|\w)+ — the classic shapes of
 * catastrophic backtracking. A player's input could otherwise freeze the
 * server while it is checked. Deliberately conservative: (a|b)+ is refused
 * too, since [ab]+ says the same thing safely.
 */
function hasNestedQuantifier(pattern: string): boolean {
  // One entry per open group: does it contain a repeating quantifier (or an alternation)?
  const groups: boolean[] = [];
  let inClass = false;
  const isRepeat = (at: number) => {
    const c = pattern[at];
    if (c === "*" || c === "+") return true;
    if (c !== "{") return false;
    const m = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(at));
    if (!m) return false;
    // A fixed count {n} leaves nothing to backtrack over; {n,} and {n,m} (m > n) do.
    if (m[2] == null) return false;
    return m[3] === "" || Number(m[3]) > Number(m[1]);
  };
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (inClass) {
      if (c === "]") inClass = false;
      continue;
    }
    if (c === "[") {
      inClass = true;
    } else if (c === "(") {
      groups.push(false);
    } else if (c === "|" && groups.length > 0) {
      groups[groups.length - 1] = true;
    } else if (c === ")") {
      const innerRepeats = groups.pop() ?? false;
      const repeated = isRepeat(i + 1);
      if (innerRepeats && repeated) return true;
      if ((innerRepeats || repeated) && groups.length > 0) groups[groups.length - 1] = true;
    } else if (groups.length > 0 && isRepeat(i)) {
      groups[groups.length - 1] = true;
    }
  }
  return false;
}

type RegexCache = Map<string, RegExp | null>;
const regexCache: RegexCache = new Map();

function compileAnswerPattern(pattern: string): RegExp | null {
  const hit = regexCache.get(pattern);
  if (hit !== undefined) return hit;
  let compiled: RegExp | null = null;
  if (regexAnswerError(pattern) == null) {
    // Anchored so the pattern has to account for the whole answer.
    compiled = new RegExp(`^(?:${pattern})$`, "i");
  }
  if (regexCache.size > 500) regexCache.clear();
  regexCache.set(pattern, compiled);
  return compiled;
}

/**
 * Whether `input` matches any of the accepted `answers` under `mode`.
 * Empty inputs and inputs over MAX_ANSWER_INPUT characters never match.
 */
export function matchAnswer(input: string, answers: readonly string[], mode: AnswerMatchMode = "loose"): boolean {
  if (typeof input !== "string" || input.length > MAX_ANSWER_INPUT) return false;
  if (input.trim() === "") return false;

  switch (mode) {
    case "loose": {
      const given = normalizeAnswer(input);
      if (given === "") return false;
      const givenBare = withoutArticle(given);
      return answers.some((answer) => {
        const expected = normalizeAnswer(answer);
        if (expected === "") return false;
        return expected === given || withoutArticle(expected) === givenBare;
      });
    }
    case "exact": {
      const given = input.trim().normalize("NFC");
      return answers.some((answer) => answer.trim() !== "" && answer.trim().normalize("NFC") === given);
    }
    case "regex": {
      const given = input.trim().normalize("NFC");
      return answers.some((pattern) => compileAnswerPattern(pattern)?.test(given) ?? false);
    }
    default:
      return false;
  }
}
