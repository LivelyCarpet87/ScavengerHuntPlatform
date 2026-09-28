/**
 * Answer checking for "answer" tasks.
 *
 * Pure functions with no database or framework imports, so the same rules run
 * in the upload API, in tests (`bun test lib/judging`), in the judge queue and
 * in the task editor's "Try an answer". Three modes, chosen per task
 * (tasks.answerMatch):
 *
 *   loose  forgiving equality: case, accents, extra spaces, surrounding
 *          punctuation/quotes, phone "smart" punctuation and a leading
 *          "the"/"a"/"an" are ignored — "The Gargoyle!" matches "gargoyle"
 *   exact  trimmed, case-sensitive equality
 *   regex  each accepted answer is a case-insensitive pattern that must match
 *          the whole input — "colou?r" matches "Colour" but not "colours"
 *
 * Safety: players choose the text, so checking it must never be slow. Inputs
 * longer than MAX_ANSWER_INPUT never match, and patterns are never handed to
 * the built-in RegExp engine for matching: it backtracks, so shapes like
 * a*a*a*a*b or (a+)+ take exponential time on text that almost matches. They
 * run on the small linear-time matcher below instead, which bounds every check
 * at MAX_PATTERN_PROGRAM × input length steps. Patterns it can't run (invalid,
 * too long, or using features like backreferences) never match; see
 * regexAnswerError, which the task editor uses to explain why before saving.
 */

export type AnswerMatchMode = "loose" | "exact" | "regex";

/** Longest input that can match. Anything longer is treated as a wrong answer. */
export const MAX_ANSWER_INPUT = 500;
/** Longest regex pattern that is ever compiled. */
export const MAX_ANSWER_PATTERN = 200;
/**
 * Largest compiled pattern (roughly one step per character, bracket or
 * repetition). Counted repeats multiply: [a-z]{1,40} counts 80. This bounds
 * the work per checked character.
 */
export const MAX_PATTERN_PROGRAM = 1000;

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
    // Only to check the syntax (compiling doesn't run anything); matching uses compilePattern.
    new RegExp(pattern, "i");
  } catch {
    return "That isn’t a valid regular expression. Check brackets and backslashes.";
  }
  try {
    compilePattern(pattern);
  } catch (err) {
    if (err instanceof PatternError) return err.message;
    throw err;
  }
  return null;
}

const compiledPatterns = new Map<string, Program | null>();

/** The runnable form of an accepted pattern, or null when regexAnswerError objects to it. */
function programFor(pattern: string): Program | null {
  const hit = compiledPatterns.get(pattern);
  if (hit !== undefined) return hit;
  const program = regexAnswerError(pattern) == null ? compilePattern(pattern) : null;
  if (compiledPatterns.size > 500) compiledPatterns.clear();
  compiledPatterns.set(pattern, program);
  return program;
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
      return answers.some((pattern) => {
        const program = programFor(pattern);
        return program ? runProgram(program, given) : false;
      });
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Pattern matcher
// ---------------------------------------------------------------------------
//
// A pattern means what it would in a JavaScript /^(?:pattern)$/i regex, and is
// run as a Thompson NFA: every way the pattern could be matching is followed
// at once, one input character at a time, so nothing is ever retried.
//
// Supported: literal characters, ".", classes [a-z] [^0-9], \d \w \s \D \W \S,
// \b \B ^ $, groups (…) (?:…) (?<name>…), alternation |, quantifiers * + ?
// {n} {n,} {n,m} (and their lazy forms, which match the same answers), and the
// escapes \t \n \r \v \f \0 \xHH \uHHHH, plus a backslash before punctuation.
// Refused with a reason: backreferences (\1, \k<name>), lookaround ((?=…),
// (?<!…) …), other letter escapes (\p{…}, \c…, \A …) and inline modifiers.
//
// Like the built-in engine without the u flag, text is read as UTF-16 code
// units and case is compared by upper-casing single characters.

/** Thrown while compiling a pattern the matcher can't run; the message is for organizers. */
class PatternError extends Error {}

const UNSUPPORTED_BACKREF = "Backreferences like \\1 aren’t supported in answer patterns. Write the text out instead.";
const UNSUPPORTED_LOOKAROUND = "Lookarounds like (?=…) or (?!…) aren’t supported in answer patterns.";
const UNSUPPORTED_ESCAPE =
  "That pattern uses an escape answer patterns don’t support. Use \\d, \\w, \\s, \\b, or a backslash before punctuation like \\. or \\?.";
const UNSUPPORTED_GROUP = "That kind of group isn’t supported in answer patterns. Use (…) or (?:…).";
const TOO_BIG = "That pattern is too big to check quickly. Use smaller numbers in {…}.";
const UNREADABLE = "That pattern couldn’t be read. Check brackets and backslashes.";

type ClassEscape = "d" | "D" | "w" | "W" | "s" | "S";
type SetItem = { lo: number; hi: number } | { esc: ClassEscape };
type CharSet = { negate: boolean; items: SetItem[] };
type AssertKind = "start" | "end" | "word" | "nonword";

type Node =
  | { t: "char"; code: number }
  | { t: "set"; set: CharSet }
  | { t: "assert"; kind: AssertKind }
  | { t: "cat"; items: Node[] }
  | { t: "alt"; items: Node[] }
  | { t: "repeat"; node: Node; min: number; max: number };

const CHAR = 0;
const SET = 1;
const SPLIT = 2;
const JMP = 3;
const ASSERT = 4;
const MATCH = 5;

type SplitInst = { op: typeof SPLIT; x: number; y: number };
type JmpInst = { op: typeof JMP; x: number };
type Inst =
  | { op: typeof CHAR; code: number }
  | { op: typeof SET; set: CharSet }
  | SplitInst
  | JmpInst
  | { op: typeof ASSERT; kind: AssertKind }
  | { op: typeof MATCH };

const ASSERT_KINDS: readonly AssertKind[] = ["start", "end", "word", "nonword"];

/**
 * A compiled pattern, packed for the matcher. Instruction k is op[k] with
 * a[k]: CHAR its canonical character, SET an index into `sets`, SPLIT and JMP
 * the (first) target, ASSERT an index into ASSERT_KINDS; and b[k]: SPLIT's
 * second target.
 */
type Program = { op: Uint8Array; a: Int32Array; b: Int32Array; sets: CharSet[] };

/** "." — anything but a line terminator. */
const DOT: CharSet = {
  negate: true,
  items: [
    { lo: 10, hi: 10 },
    { lo: 13, hi: 13 },
    { lo: 0x2028, hi: 0x2029 },
  ],
};

/** Parses (with Annex B rules, as browsers do without the u flag) and compiles; throws PatternError. */
function compilePattern(pattern: string): Program {
  const tree = parsePattern(pattern);
  if (programSize(tree) + 1 > MAX_PATTERN_PROGRAM) throw new PatternError(TOO_BIG);
  const insts: Inst[] = [];
  emit(tree, insts);
  insts.push({ op: MATCH });
  const program: Program = {
    op: new Uint8Array(insts.length),
    a: new Int32Array(insts.length),
    b: new Int32Array(insts.length),
    sets: [],
  };
  insts.forEach((inst, k) => {
    program.op[k] = inst.op;
    switch (inst.op) {
      case CHAR:
        program.a[k] = inst.code;
        break;
      case SET: {
        // Copies made by {n,m} share their set, so it's tested once per character.
        const known = program.sets.indexOf(inst.set);
        program.a[k] = known >= 0 ? known : program.sets.push(inst.set) - 1;
        break;
      }
      case SPLIT:
        program.a[k] = inst.x;
        program.b[k] = inst.y;
        break;
      case JMP:
        program.a[k] = inst.x;
        break;
      case ASSERT:
        program.a[k] = ASSERT_KINDS.indexOf(inst.kind);
        break;
    }
  });
  return program;
}

function parsePattern(src: string): Node {
  let i = 0;

  function disjunction(): Node {
    const alternatives = [alternative()];
    while (src[i] === "|") {
      i += 1;
      alternatives.push(alternative());
    }
    return alternatives.length === 1 ? alternatives[0] : { t: "alt", items: alternatives };
  }

  function alternative(): Node {
    const items: Node[] = [];
    while (i < src.length && src[i] !== "|" && src[i] !== ")") items.push(term());
    return items.length === 1 ? items[0] : { t: "cat", items };
  }

  function term(): Node {
    const c = src[i];
    if (c === "^" || c === "$") {
      i += 1;
      return { t: "assert", kind: c === "^" ? "start" : "end" };
    }
    if (c === "\\" && (src[i + 1] === "b" || src[i + 1] === "B")) {
      i += 2;
      return { t: "assert", kind: src[i - 1] === "b" ? "word" : "nonword" };
    }
    if (
      src.startsWith("(?=", i) ||
      src.startsWith("(?!", i) ||
      src.startsWith("(?<=", i) ||
      src.startsWith("(?<!", i)
    ) {
      throw new PatternError(UNSUPPORTED_LOOKAROUND);
    }
    return quantified(atom());
  }

  function quantified(node: Node): Node {
    let min: number;
    let max: number;
    const c = src[i];
    if (c === "*" || c === "+" || c === "?") {
      min = c === "+" ? 1 : 0;
      max = c === "?" ? 1 : Number.POSITIVE_INFINITY;
      i += 1;
    } else if (c === "{") {
      const m = /^\{(\d+)(?:(,)(\d*))?\}/.exec(src.slice(i));
      // Without the digits it's a literal "{", read as the next atom.
      if (!m) return node;
      min = Number(m[1]);
      max = m[2] == null ? min : m[3] === "" ? Number.POSITIVE_INFINITY : Number(m[3]);
      i += m[0].length;
    } else {
      return node;
    }
    // A lazy quantifier matches the same whole answers.
    if (src[i] === "?") i += 1;
    return { t: "repeat", node, min, max };
  }

  function atom(): Node {
    const c = src[i];
    if (c === ".") {
      i += 1;
      return { t: "set", set: DOT };
    }
    if (c === "(") {
      i += 1;
      if (src[i] === "?") {
        if (src[i + 1] === ":") {
          i += 2;
        } else if (src[i + 1] === "<") {
          // A named group: the name doesn't matter here.
          const close = src.indexOf(">", i);
          if (close < 0) throw new PatternError(UNREADABLE);
          i = close + 1;
        } else {
          throw new PatternError(UNSUPPORTED_GROUP);
        }
      }
      const inner = disjunction();
      if (src[i] !== ")") throw new PatternError(UNREADABLE);
      i += 1;
      return inner;
    }
    if (c === "[") return charClass();
    if (c === "\\") {
      const e = src[i + 1];
      if (isClassEscape(e)) {
        i += 2;
        return { t: "set", set: { negate: false, items: [{ esc: e }] } };
      }
      return { t: "char", code: characterEscape(false) };
    }
    // Annex B: "]", "{" (when it isn't a quantifier) and "}" stand for themselves.
    if (c === undefined || c === ")" || c === "|" || c === "*" || c === "+" || c === "?") {
      throw new PatternError(UNREADABLE);
    }
    i += 1;
    return { t: "char", code: c.charCodeAt(0) };
  }

  function charClass(): Node {
    i += 1; // [
    let negate = false;
    if (src[i] === "^") {
      negate = true;
      i += 1;
    }
    const items: SetItem[] = [];
    while (i < src.length && src[i] !== "]") {
      const from = classAtom();
      if (src[i] === "-" && i + 1 < src.length && src[i + 1] !== "]") {
        i += 1;
        const to = classAtom();
        if ("code" in from && "code" in to) {
          if (to.code < from.code) throw new PatternError(UNREADABLE);
          items.push({ lo: from.code, hi: to.code });
        } else {
          // Annex B: next to \d, \w or \s a dash is just a dash.
          items.push(setItem(from), { lo: 45, hi: 45 }, setItem(to));
        }
      } else {
        items.push(setItem(from));
      }
    }
    if (src[i] !== "]") throw new PatternError(UNREADABLE);
    i += 1;
    return { t: "set", set: { negate, items } };
  }

  function classAtom(): { code: number } | { esc: ClassEscape } {
    const c = src[i];
    if (c === "\\") {
      const e = src[i + 1];
      if (isClassEscape(e)) {
        i += 2;
        return { esc: e };
      }
      return { code: characterEscape(true) };
    }
    i += 1;
    return { code: c.charCodeAt(0) };
  }

  /** At a backslash: the character it stands for. */
  function characterEscape(inClass: boolean): number {
    const e = src[i + 1];
    if (e === undefined) throw new PatternError(UNREADABLE);
    const simple: Record<string, number> = { t: 9, n: 10, v: 11, f: 12, r: 13 };
    if (e in simple) {
      i += 2;
      return simple[e];
    }
    if (e === "b" && inClass) {
      i += 2;
      return 8; // backspace, inside a class
    }
    if (e === "0" && !/[0-9]/.test(src[i + 2] ?? "")) {
      i += 2;
      return 0;
    }
    if (e === "x" || e === "u") {
      const digits = e === "x" ? 2 : 4;
      const hex = src.slice(i + 2, i + 2 + digits);
      if (!new RegExp(`^[0-9a-fA-F]{${digits}}$`).test(hex)) throw new PatternError(UNSUPPORTED_ESCAPE);
      i += 2 + digits;
      return Number.parseInt(hex, 16);
    }
    if (/[0-9]/.test(e)) throw new PatternError(UNSUPPORTED_BACKREF);
    if (e === "k") throw new PatternError(UNSUPPORTED_BACKREF);
    if (/[A-Za-z]/.test(e)) throw new PatternError(UNSUPPORTED_ESCAPE);
    // Punctuation, spaces and other symbols stand for themselves.
    i += 2;
    return e.charCodeAt(0);
  }

  const tree = disjunction();
  if (i !== src.length) throw new PatternError(UNREADABLE);
  return tree;
}

function isClassEscape(c: string | undefined): c is ClassEscape {
  return c === "d" || c === "D" || c === "w" || c === "W" || c === "s" || c === "S";
}

function setItem(atom: { code: number } | { esc: ClassEscape }): SetItem {
  return "code" in atom ? { lo: atom.code, hi: atom.code } : atom;
}

/** Instructions `node` compiles to (excluding MATCH); Infinity once it's clearly too big. */
function programSize(node: Node): number {
  switch (node.t) {
    case "char":
    case "set":
    case "assert":
      return 1;
    case "cat":
      return node.items.reduce((n, item) => n + programSize(item), 0);
    case "alt":
      return node.items.reduce((n, item) => n + programSize(item), 0) + 2 * (node.items.length - 1);
    case "repeat": {
      const inner = programSize(node.node);
      if (inner > MAX_PATTERN_PROGRAM || node.min > MAX_PATTERN_PROGRAM) return Number.POSITIVE_INFINITY;
      if (node.max === Number.POSITIVE_INFINITY) return node.min * inner + inner + 2;
      if (node.max > MAX_PATTERN_PROGRAM) return Number.POSITIVE_INFINITY;
      return node.min * inner + (node.max - node.min) * (inner + 1);
    }
  }
}

function emit(node: Node, program: Inst[]): void {
  switch (node.t) {
    case "char":
      program.push({ op: CHAR, code: canonical(node.code) });
      return;
    case "set":
      program.push({ op: SET, set: node.set });
      return;
    case "assert":
      program.push({ op: ASSERT, kind: node.kind });
      return;
    case "cat":
      for (const item of node.items) emit(item, program);
      return;
    case "alt": {
      // split → first | (split → second | …); each branch jumps to the end.
      const exits: JmpInst[] = [];
      node.items.forEach((item, k) => {
        if (k === node.items.length - 1) {
          emit(item, program);
          return;
        }
        const split: SplitInst = { op: SPLIT, x: program.length + 1, y: -1 };
        program.push(split);
        emit(item, program);
        const exit: JmpInst = { op: JMP, x: -1 };
        exits.push(exit);
        program.push(exit);
        split.y = program.length;
      });
      for (const exit of exits) exit.x = program.length;
      return;
    }
    case "repeat": {
      for (let k = 0; k < node.min; k++) emit(node.node, program);
      if (node.max === Number.POSITIVE_INFINITY) {
        const loop = program.length;
        const split: SplitInst = { op: SPLIT, x: loop + 1, y: -1 };
        program.push(split);
        emit(node.node, program);
        program.push({ op: JMP, x: loop });
        split.y = program.length;
        return;
      }
      // Optional copies; skipping one skips the rest.
      const skips: SplitInst[] = [];
      for (let k = node.min; k < node.max; k++) {
        const split: SplitInst = { op: SPLIT, x: program.length + 1, y: -1 };
        skips.push(split);
        program.push(split);
        emit(node.node, program);
      }
      for (const split of skips) split.y = program.length;
      return;
    }
  }
}

/** How the built-in engine compares characters under the i flag (without u). */
function canonical(code: number): number {
  const upper = String.fromCharCode(code).toUpperCase();
  if (upper.length !== 1) return code;
  const u = upper.charCodeAt(0);
  // Non-ASCII letters never fold into ASCII ("ſ" stays "ſ").
  return code >= 128 && u < 128 ? code : u;
}

function lowerCase(code: number): number {
  const lower = String.fromCharCode(code).toLowerCase();
  return lower.length === 1 ? lower.charCodeAt(0) : code;
}

/**
 * Characters that upper-case to the same letter as a more common pair but
 * aren't that letter's lower case (ς and σ both give Σ; ϐ and β give Β …),
 * keyed by that upper-case letter. With these, the case forms of a character
 * are exactly the ones the built-in engine considers equal.
 */
const EXTRA_CASE_FORMS = new Map<number, number[]>([
  [0x1c4, [0x1c5]],
  [0x1c7, [0x1c8]],
  [0x1ca, [0x1cb]],
  [0x1f1, [0x1f2]],
  [0x392, [0x3d0]],
  [0x395, [0x3f5]],
  [0x398, [0x3d1]],
  [0x399, [0x345, 0x1fbe]],
  [0x39a, [0x3f0]],
  [0x39c, [0xb5]],
  [0x3a0, [0x3d6]],
  [0x3a1, [0x3f1]],
  [0x3a3, [0x3c2]],
  [0x3a6, [0x3d5]],
  [0x412, [0x1c80]],
  [0x414, [0x1c81]],
  [0x41e, [0x1c82]],
  [0x421, [0x1c83]],
  [0x422, [0x1c84, 0x1c85]],
  [0x42a, [0x1c86]],
  [0x462, [0x1c87]],
  [0x1e60, [0x1e9b]],
  [0xa64a, [0x1c88]],
]);

/** Every character the built-in engine treats as equal to `code` under the i flag, `code` first. */
function caseForms(code: number): number[] {
  const canon = canonical(code);
  const forms = [code];
  for (const v of [canon, lowerCase(code), lowerCase(canon), ...(EXTRA_CASE_FORMS.get(canon) ?? [])]) {
    if (!forms.includes(v) && canonical(v) === canon) forms.push(v);
  }
  return forms;
}

function isWordChar(code: number): boolean {
  return (
    (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 // _
  );
}

function isSpace(code: number): boolean {
  return (
    (code >= 9 && code <= 13) ||
    code === 32 ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

function inSet(set: CharSet, code: number): boolean {
  for (const item of set.items) {
    if ("esc" in item) {
      const hit =
        item.esc === "d" || item.esc === "D"
          ? code >= 48 && code <= 57
          : item.esc === "w" || item.esc === "W"
            ? isWordChar(code)
            : isSpace(code);
      // Upper-case escapes are the complements.
      if (hit === (item.esc === "d" || item.esc === "w" || item.esc === "s")) return true;
    } else if (code >= item.lo && code <= item.hi) {
      return true;
    }
  }
  return false;
}

/**
 * Under the i flag a set matches a character when any member upper-cases to
 * the same thing, i.e. when it holds one of the character's case forms.
 */
function setMatches(set: CharSet, forms: readonly number[]): boolean {
  return forms.some((code) => inSet(set, code)) !== set.negate;
}

function assertHolds(kind: AssertKind, text: string, pos: number): boolean {
  switch (kind) {
    case "start":
      return pos === 0;
    case "end":
      return pos === text.length;
    default: {
      const before = pos > 0 && isWordChar(text.charCodeAt(pos - 1));
      const after = pos < text.length && isWordChar(text.charCodeAt(pos));
      return (before !== after) === (kind === "word");
    }
  }
}

/** Whether the program matches all of `text`: O(program × text) steps, however the pattern is written. */
function runProgram(program: Program, text: string): boolean {
  const { op, a, b, sets } = program;
  const size = op.length;
  const n = text.length;
  // The last position each instruction was reached at, so it is visited once per position.
  const seen = new Int32Array(size).fill(-1);
  // Every visited instruction pushes at most two more.
  const stack = new Int32Array(2 * size + 1);
  let current = new Int32Array(size);
  let next = new Int32Array(size);
  let currentLength = 0;
  let nextLength = 0;
  let matched = false;
  // Each set's verdict for the character at `testedAt`.
  const testedAt = new Int32Array(sets.length).fill(-1);
  const verdict = new Uint8Array(sets.length);

  /** Adds to `next` the character-reading instructions reachable from `start` without reading one. */
  const follow = (start: number, pos: number) => {
    let top = 0;
    stack[top++] = start;
    while (top > 0) {
      const pc = stack[--top];
      if (seen[pc] === pos) continue;
      seen[pc] = pos;
      switch (op[pc]) {
        case JMP:
          stack[top++] = a[pc];
          break;
        case SPLIT:
          stack[top++] = b[pc];
          stack[top++] = a[pc];
          break;
        case ASSERT:
          if (assertHolds(ASSERT_KINDS[a[pc]], text, pos)) stack[top++] = pc + 1;
          break;
        case MATCH:
          if (pos === n) matched = true;
          break;
        default:
          next[nextLength++] = pc;
      }
    }
  };

  follow(0, 0);
  for (let pos = 0; pos < n && nextLength > 0; pos++) {
    [current, next] = [next, current];
    currentLength = nextLength;
    nextLength = 0;
    const code = text.charCodeAt(pos);
    const canon = canonical(code);
    let forms: number[] | null = null;
    for (let k = 0; k < currentLength; k++) {
      const pc = current[k];
      let ok: boolean;
      if (op[pc] === CHAR) {
        ok = a[pc] === canon;
      } else {
        const set = a[pc];
        if (testedAt[set] !== pos) {
          forms ??= caseForms(code);
          testedAt[set] = pos;
          verdict[set] = setMatches(sets[set], forms) ? 1 : 0;
        }
        ok = verdict[set] === 1;
      }
      if (ok) follow(pc + 1, pos + 1);
    }
  }
  return matched;
}
