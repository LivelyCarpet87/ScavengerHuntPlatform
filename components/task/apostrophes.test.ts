import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/*
 * Player-facing text on the task and checkpoint screens uses the typographic
 * apostrophe (’), like the join and team screens: at display sizes a straight
 * ' reads like a typewriter tick. This flags a contraction or possessive
 * written with ' anywhere in these files except comments, so new copy stays
 * consistent. (Code never needs one: strings use double quotes.)
 */

const ROOT = join(import.meta.dir, "..", "..");
const AREA = [
  "components/task",
  "components/scan",
  "app/h/[slug]/(play)/tasks",
  "app/h/[slug]/(play)/cp",
  "app/api/hunts/[huntId]/submissions",
  "lib/offline",
  "lib/player/submit.ts",
  "lib/player/hints.ts",
  "lib/judging/answers.ts",
];

function sourceFiles(path: string): string[] {
  const full = join(ROOT, path);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((name) => {
    const child = join(path, name);
    if (statSync(join(ROOT, child)).isDirectory()) return sourceFiles(child);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [join(ROOT, child)] : [];
  });
}

/** Each line with its comments removed (line, block and JSX comments; block comments may span lines). */
function withoutComments(text: string): string[] {
  let inBlock = false;
  return text.split("\n").map((raw) => {
    let line = raw.replace(/\{\/\*.*?\*\/\}/g, "").replace(/\/\*.*?\*\//g, "");
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end < 0) return "";
      inBlock = false;
      line = line.slice(end + 2);
    }
    const start = line.search(/(^|\s|\{)\/\*/);
    if (start >= 0) {
      inBlock = true;
      line = line.slice(0, start);
    }
    // A line comment starts at "//" after whitespace (so "https://…" inside a string is kept).
    return line.replace(/(^|\s)\/\/.*$/, "");
  });
}

describe("task screens copy", () => {
  test("uses ’ rather than ' in contractions and possessives", () => {
    const found: string[] = [];
    for (const file of AREA.flatMap(sourceFiles)) {
      withoutComments(readFileSync(file, "utf8")).forEach((line, i) => {
        if (/[A-Za-z]'[A-Za-z]/.test(line)) found.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(found).toEqual([]);
  });

  test("the check itself ignores comments and catches copy", () => {
    const lines = withoutComments(
      [
        "// Don't flag this",
        "/** Nor this, it's a comment */",
        "/*",
        " * or this, it's in a block",
        " */",
        "{/* or a JSX comment that isn't copy */}",
        'const url = "https://example.com"; // a comment that doesn\'t count',
        'setError("That code doesn\'t match.");',
      ].join("\n"),
    );
    expect(lines.filter((line) => /[A-Za-z]'[A-Za-z]/.test(line))).toEqual(['setError("That code doesn\'t match.");']);
  });
});
