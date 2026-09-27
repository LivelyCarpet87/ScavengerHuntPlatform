import { describe, expect, test } from "bun:test";
import { parseCheckpointInput } from "./checkpoint-link";

describe("parseCheckpointInput", () => {
  test("reads a poster link, absolute or relative", () => {
    expect(parseCheckpointInput("https://hunt.example.com/h/campus-night-hunt/cp/FNT7Q2")).toEqual({
      code: "FNT7Q2",
      slug: "campus-night-hunt",
    });
    expect(parseCheckpointInput("/h/campus-night-hunt/cp/fnt7q2/")).toEqual({
      code: "FNT7Q2",
      slug: "campus-night-hunt",
    });
  });

  test("ignores query strings and fragments on links", () => {
    expect(parseCheckpointInput("http://localhost:3000/h/qa/cp/QAC4K7?utm=poster#top")).toEqual({
      code: "QAC4K7",
      slug: "qa",
    });
  });

  test("normalizes codes typed by hand", () => {
    expect(parseCheckpointInput(" fnt 7q2 ")).toEqual({ code: "FNT7Q2", slug: null });
    expect(parseCheckpointInput("FNT-7Q2")).toEqual({ code: "FNT7Q2", slug: null });
  });

  test("decodes escaped characters in a link's code", () => {
    expect(parseCheckpointInput("/h/qa/cp/FNT%207Q2")?.code).toBe("FNT7Q2");
  });

  test("rejects other links", () => {
    expect(parseCheckpointInput("https://hunt.example.com/join/482913")).toBeNull();
    expect(parseCheckpointInput("https://hunt.example.com/h/campus/tasks/abc")).toBeNull();
    expect(parseCheckpointInput("https://evil.example.com/h/x/cp/")).toBeNull();
  });

  test("rejects text that can't be a code", () => {
    expect(parseCheckpointInput("")).toBeNull();
    expect(parseCheckpointInput("  ")).toBeNull();
    expect(parseCheckpointInput("ab")).toBeNull();
    expect(parseCheckpointInput("!!!")).toBeNull();
    expect(parseCheckpointInput("x".repeat(40))).toBeNull();
  });
});
