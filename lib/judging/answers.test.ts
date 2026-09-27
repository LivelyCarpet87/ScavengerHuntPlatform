import { describe, expect, test } from "bun:test";
import { MAX_ANSWER_INPUT, MAX_ANSWER_PATTERN, matchAnswer, normalizeAnswer, regexAnswerError } from "./answers";

describe("normalizeAnswer", () => {
  test("lowercases and trims", () => {
    expect(normalizeAnswer("  Gargoyle ")).toBe("gargoyle");
  });

  test("collapses inner whitespace, including tabs, newlines and non-breaking spaces", () => {
    expect(normalizeAnswer("old \t  gym\nentrance")).toBe("old gym entrance");
    expect(normalizeAnswer("old gym")).toBe("old gym");
  });

  test("strips diacritics", () => {
    expect(normalizeAnswer("Crème Brûlée")).toBe("creme brulee");
    expect(normalizeAnswer("Ångström")).toBe("angstrom");
    expect(normalizeAnswer("São Paulo")).toBe("sao paulo");
  });

  test("folds compatibility forms and full-width characters", () => {
    expect(normalizeAnswer("ﬁsh")).toBe("fish");
    expect(normalizeAnswer("ＧＡＲＧＯＹＬＥ")).toBe("gargoyle");
  });

  test("applies full case folding", () => {
    expect(normalizeAnswer("STRASSE")).toBe(normalizeAnswer("straße"));
  });

  test("strips punctuation and quotes around the answer", () => {
    expect(normalizeAnswer("Gargoyle!")).toBe("gargoyle");
    expect(normalizeAnswer('"gargoyle"')).toBe("gargoyle");
    expect(normalizeAnswer("“Gargoyle.”")).toBe("gargoyle");
    expect(normalizeAnswer("(gargoyle)")).toBe("gargoyle");
    expect(normalizeAnswer("¿qué?")).toBe("que");
    expect(normalizeAnswer("'twas")).toBe("twas");
  });

  test("keeps punctuation inside the answer", () => {
    expect(normalizeAnswer("St. Paul's")).toBe("st. paul's");
    expect(normalizeAnswer("rock-n-roll")).toBe("rock-n-roll");
  });

  test("folds smart punctuation from phone keyboards", () => {
    expect(normalizeAnswer("O’Brien")).toBe("o'brien");
    expect(normalizeAnswer("rock–n–roll")).toBe("rock-n-roll");
  });

  test("keeps symbols that carry meaning", () => {
    expect(normalizeAnswer("C++")).toBe("c++");
    expect(normalizeAnswer("£5")).toBe("£5");
  });

  test("returns an empty string for punctuation-only input", () => {
    expect(normalizeAnswer(" ?!… ")).toBe("");
  });
});

describe("matchAnswer: loose", () => {
  const answers = ["gargoyle", "gargoyles"];

  test("accepts any accepted answer, ignoring case and spacing", () => {
    expect(matchAnswer("Gargoyle", answers)).toBe(true);
    expect(matchAnswer("  GARGOYLES  ", answers)).toBe(true);
  });

  test("defaults to loose mode", () => {
    expect(matchAnswer("GARGOYLE", answers)).toBe(true);
  });

  test("rejects other words and partial answers", () => {
    expect(matchAnswer("owl", answers, "loose")).toBe(false);
    expect(matchAnswer("gargoyl", answers, "loose")).toBe(false);
    expect(matchAnswer("a gargoyle statue", answers, "loose")).toBe(false);
  });

  test("ignores a leading article on either side", () => {
    expect(matchAnswer("The gargoyle", answers, "loose")).toBe(true);
    expect(matchAnswer("a gargoyle", answers, "loose")).toBe(true);
    expect(matchAnswer("an   Gargoyle", answers, "loose")).toBe(true);
    expect(matchAnswer("Beatles", ["The Beatles"], "loose")).toBe(true);
    expect(matchAnswer("the beatles", ["Beatles"], "loose")).toBe(true);
  });

  test("only strips whole-word articles", () => {
    expect(matchAnswer("theatre", ["atre"], "loose")).toBe(false);
    expect(matchAnswer("another", ["other"], "loose")).toBe(false);
  });

  test("an answer that is only an article still matches itself", () => {
    expect(matchAnswer("A", ["a"], "loose")).toBe(true);
    expect(matchAnswer("the", ["The"], "loose")).toBe(true);
  });

  test("ignores accents, punctuation and quotes around the answer", () => {
    expect(matchAnswer("cafe", ["Café"], "loose")).toBe(true);
    expect(matchAnswer("“Café!”", ["cafe"], "loose")).toBe(true);
  });

  test("matches numbers typed with stray punctuation", () => {
    expect(matchAnswer("1987.", ["1987"], "loose")).toBe(true);
    expect(matchAnswer("1978", ["1987"], "loose")).toBe(false);
  });

  test("never matches empty input or empty accepted answers", () => {
    expect(matchAnswer("", answers, "loose")).toBe(false);
    expect(matchAnswer("   ", answers, "loose")).toBe(false);
    expect(matchAnswer("!!!", ["?"], "loose")).toBe(false);
    expect(matchAnswer("anything", ["", "  "], "loose")).toBe(false);
    expect(matchAnswer("gargoyle", [], "loose")).toBe(false);
  });

  test("never matches inputs over the length limit", () => {
    const long = `gargoyle${" ".repeat(MAX_ANSWER_INPUT)}`;
    expect(long.length).toBeGreaterThan(MAX_ANSWER_INPUT);
    expect(matchAnswer(long, answers, "loose")).toBe(false);
  });
});

describe("matchAnswer: exact", () => {
  test("is case-sensitive", () => {
    expect(matchAnswer("Gargoyle", ["Gargoyle"], "exact")).toBe(true);
    expect(matchAnswer("gargoyle", ["Gargoyle"], "exact")).toBe(false);
  });

  test("trims both sides but keeps inner spacing and punctuation", () => {
    expect(matchAnswer("  Night Owl ", ["Night Owl"], "exact")).toBe(true);
    expect(matchAnswer("Night  Owl", ["Night Owl"], "exact")).toBe(false);
    expect(matchAnswer("Night Owl!", ["Night Owl"], "exact")).toBe(false);
  });

  test("does not strip accents or articles", () => {
    expect(matchAnswer("Cafe", ["Café"], "exact")).toBe(false);
    expect(matchAnswer("The Beatles", ["Beatles"], "exact")).toBe(false);
  });

  test("treats composed and decomposed accents as the same text", () => {
    const composed = "Café";
    const decomposed = "Café";
    expect(matchAnswer(decomposed, [composed], "exact")).toBe(true);
  });

  test("never matches empty input", () => {
    expect(matchAnswer(" ", [" "], "exact")).toBe(false);
  });
});

describe("matchAnswer: regex", () => {
  test("matches case-insensitively", () => {
    expect(matchAnswer("COLOUR", ["colou?r"], "regex")).toBe(true);
    expect(matchAnswer("color", ["colou?r"], "regex")).toBe(true);
  });

  test("anchors the pattern to the whole input", () => {
    expect(matchAnswer("colours", ["colou?r"], "regex")).toBe(false);
    expect(matchAnswer("my colour", ["colou?r"], "regex")).toBe(false);
  });

  test("anchors alternations as a whole", () => {
    expect(matchAnswer("cat", ["cat|dog"], "regex")).toBe(true);
    expect(matchAnswer("dog", ["cat|dog"], "regex")).toBe(true);
    expect(matchAnswer("catalog", ["cat|dog"], "regex")).toBe(false);
    expect(matchAnswer("hotdog", ["cat|dog"], "regex")).toBe(false);
  });

  test("trims the input before matching", () => {
    expect(matchAnswer("  1987 ", ["19[0-9]{2}"], "regex")).toBe(true);
  });

  test("tries every pattern", () => {
    expect(matchAnswer("owl", ["gargoyles?", "owls?"], "regex")).toBe(true);
  });

  test("invalid patterns never match, and don't stop valid ones", () => {
    expect(matchAnswer("abc", ["(abc"], "regex")).toBe(false);
    expect(matchAnswer("abc", ["[abc", "abc"], "regex")).toBe(true);
  });

  test("patterns over the length limit never match", () => {
    const long = `a{1}${"b?".repeat(MAX_ANSWER_PATTERN)}`;
    expect(long.length).toBeGreaterThan(MAX_ANSWER_PATTERN);
    expect(matchAnswer("a", [long], "regex")).toBe(false);
  });

  test("inputs over the length limit never match", () => {
    expect(matchAnswer("a".repeat(MAX_ANSWER_INPUT + 1), ["a+"], "regex")).toBe(false);
    expect(matchAnswer("a".repeat(MAX_ANSWER_INPUT), ["a+"], "regex")).toBe(true);
  });

  test("patterns prone to catastrophic backtracking never match, and return quickly", () => {
    const evil = `${"a".repeat(40)}!`;
    const started = performance.now();
    expect(matchAnswer(evil, ["(a+)+"], "regex")).toBe(false);
    expect(matchAnswer(evil, ["(\\w+\\s?)*"], "regex")).toBe(false);
    expect(performance.now() - started).toBeLessThan(200);
  });

  test("never matches empty input, even with a pattern that allows it", () => {
    expect(matchAnswer("", ["a*"], "regex")).toBe(false);
    expect(matchAnswer("  ", [".*"], "regex")).toBe(false);
  });

  test("an empty pattern list never matches", () => {
    expect(matchAnswer("anything", [], "regex")).toBe(false);
  });
});

describe("regexAnswerError", () => {
  test("accepts ordinary patterns", () => {
    expect(regexAnswerError("colou?r")).toBeNull();
    expect(regexAnswerError("(red|blue) door")).toBeNull();
    expect(regexAnswerError("19[0-9]{2}")).toBeNull();
    expect(regexAnswerError("(ab)+")).toBeNull();
    expect(regexAnswerError("(a{2})+")).toBeNull();
    expect(regexAnswerError("[(+)]+")).toBeNull();
    expect(regexAnswerError("\\(a+\\)+")).toBeNull();
  });

  test("explains empty, long and invalid patterns", () => {
    expect(regexAnswerError(" ")).toMatch(/Enter a pattern/);
    expect(regexAnswerError("a".repeat(MAX_ANSWER_PATTERN + 1))).toMatch(/up to 200 characters/);
    expect(regexAnswerError("(abc")).toMatch(/valid regular expression/);
  });

  test("flags nested repetition", () => {
    expect(regexAnswerError("(a+)+")).toMatch(/too long to check/);
    expect(regexAnswerError("(a*)*")).toMatch(/too long to check/);
    expect(regexAnswerError("(\\w+\\s?)+")).toMatch(/too long to check/);
    expect(regexAnswerError("(x{2,})+")).toMatch(/too long to check/);
    expect(regexAnswerError("((a+)b)*")).toMatch(/too long to check/);
    expect(regexAnswerError("([a-z]+)*")).toMatch(/too long to check/);
  });
});

describe("catastrophic patterns", () => {
  test("repeated groups with alternatives are refused", () => {
    expect(regexAnswerError("(\\d|\\w)+x")).not.toBeNull();
    expect(regexAnswerError("(a|b)*")).not.toBeNull();
    expect(regexAnswerError("(colou?r|color)")).toBeNull();
    expect(regexAnswerError("[ab]+")).toBeNull();
  });
});
