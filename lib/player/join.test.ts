import { describe, expect, test } from "bun:test";
import {
  cleanName,
  daysUntil,
  extractHuntCode,
  joinPolicy,
  parseHuntInput,
  safeNextPath,
  sanitizeCodeTyping,
  teamNameCandidates,
  teamNameKey,
  zTeamCode,
  zTeamName,
} from "./join";

const ORIGIN = "https://hunt.example.com";

describe("parseHuntInput", () => {
  test("plain and spaced codes", () => {
    expect(parseHuntInput("482913")).toEqual({ kind: "code", code: "482913" });
    expect(parseHuntInput(" 482 913 ")).toEqual({ kind: "code", code: "482913" });
    expect(parseHuntInput("482-913")).toEqual({ kind: "code", code: "482913" });
    expect(parseHuntInput("482.913")).toEqual({ kind: "code", code: "482913" });
  });

  test("wrong lengths and letters are not codes", () => {
    expect(parseHuntInput("48291")).toEqual({ kind: "none" });
    expect(parseHuntInput("4829134")).toEqual({ kind: "none" });
    expect(parseHuntInput("48a913")).toEqual({ kind: "none" });
    expect(parseHuntInput("")).toEqual({ kind: "none" });
  });

  test("join links from any server yield the code", () => {
    expect(parseHuntInput("https://other.example/join/482913")).toEqual({ kind: "code", code: "482913" });
    expect(parseHuntInput("other.example/join/482913")).toEqual({ kind: "code", code: "482913" });
    expect(parseHuntInput("https://other.example/h/campus?code=482913")).toEqual({ kind: "code", code: "482913" });
  });

  test("same-origin hunt links are opened directly", () => {
    expect(parseHuntInput(`${ORIGIN}/h/campus/join/K7QM4P`, ORIGIN)).toEqual({
      kind: "path",
      path: "/h/campus/join/K7QM4P",
    });
    expect(parseHuntInput(`${ORIGIN}/join/482913`, ORIGIN)).toEqual({ kind: "path", path: "/join/482913" });
    expect(parseHuntInput(`${ORIGIN}/h/campus/cp/FNT7Q2?x=1`, ORIGIN)).toEqual({
      kind: "path",
      path: "/h/campus/cp/FNT7Q2?x=1",
    });
  });

  test("same-origin links outside hunts are not followed", () => {
    expect(parseHuntInput(`${ORIGIN}/admin`, ORIGIN)).toEqual({ kind: "none" });
    expect(parseHuntInput("https://evil.example/h/campus", ORIGIN)).toEqual({ kind: "none" });
  });

  test("extractHuntCode ignores paths", () => {
    expect(extractHuntCode("https://x.example/join/705316")).toBe("705316");
    expect(extractHuntCode("hello")).toBeNull();
  });

  test("sanitizeCodeTyping keeps six digits", () => {
    expect(sanitizeCodeTyping("48a2 91-3999")).toBe("482913");
  });
});

describe("safeNextPath", () => {
  test("accepts paths inside the hunt", () => {
    expect(safeNextPath("/h/campus/cp/FNT7Q2", "campus")).toBe("/h/campus/cp/FNT7Q2");
    expect(safeNextPath("/h/campus", "campus")).toBe("/h/campus");
    expect(safeNextPath("/h/campus?welcome=1", "campus")).toBe("/h/campus?welcome=1");
  });

  test("rejects everything else", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/h/campusX/cp/1",
      "/h/other/cp/1",
      "/h/campus/../../admin",
      "/h/campus//evil.example",
      "/h/campus/\\evil",
      "/h/campus/a b",
      "/dashboard",
      42,
      null,
    ]) {
      expect(safeNextPath(bad, "campus")).toBeNull();
    }
  });
});

describe("joinPolicy", () => {
  const hunt = { teamCreation: "players", registrationOpen: true, joinMode: "code" } as const;

  test("open hunt lets players start and join teams", () => {
    const p = joinPolicy(hunt, "live");
    expect(p).toMatchObject({ closed: null, canJoinTeam: true, canCreateTeam: true, needsHuntCode: true });
    expect(joinPolicy({ ...hunt, joinMode: "open" }, "upcoming").needsHuntCode).toBe(false);
  });

  test("closed registration keeps team codes working", () => {
    const p = joinPolicy({ ...hunt, registrationOpen: false }, "live");
    expect(p.canCreateTeam).toBe(false);
    expect(p.canJoinTeam).toBe(true);
    expect(p.createNote).toContain("Registration is closed");
  });

  test("organizer-made teams", () => {
    const p = joinPolicy({ ...hunt, teamCreation: "organizers" }, "upcoming");
    expect(p.canCreateTeam).toBe(false);
    expect(p.canJoinTeam).toBe(true);
  });

  test("finished hunts are closed", () => {
    for (const phase of ["ended", "archived"] as const) {
      const p = joinPolicy(hunt, phase);
      expect(p.closed).not.toBeNull();
      expect(p.canJoinTeam || p.canCreateTeam).toBe(false);
    }
  });

  test("drafts only allow joining existing teams", () => {
    const p = joinPolicy(hunt, "draft");
    expect(p.canCreateTeam).toBe(false);
    expect(p.canJoinTeam).toBe(true);
  });
});

describe("daysUntil", () => {
  const at = (iso: string) => new Date(iso);

  test("counts calendar days in the hunt's zone, not 24-hour blocks", () => {
    // Sunday 19:30 London → Tuesday 17:27 London: under 48 hours, but two days away.
    expect(daysUntil(at("2026-09-29T16:27:00Z"), at("2026-09-27T18:30:00Z"), "Europe/London")).toBe(2);
    // Sunday 19:30 → Monday 23:00 London: tomorrow.
    expect(daysUntil(at("2026-09-28T22:00:00Z"), at("2026-09-27T18:30:00Z"), "Europe/London")).toBe(1);
  });

  test("uses the hunt's time zone for the date line", () => {
    // 23:30 UTC on the 27th is already the 28th in Shanghai.
    const now = at("2026-09-27T23:30:00Z");
    const start = at("2026-09-30T02:00:00Z");
    expect(daysUntil(start, now, "UTC")).toBe(3);
    expect(daysUntil(start, now, "Asia/Shanghai")).toBe(2);
  });

  test("a clock change doesn't skew the count", () => {
    // London leaves summer time on 25 Oct 2026.
    expect(daysUntil(at("2026-10-26T12:00:00Z"), at("2026-10-24T12:00:00Z"), "Europe/London")).toBe(2);
  });
});

describe("names", () => {
  test("cleanName collapses whitespace and control characters", () => {
    expect(cleanName("  Night \n  Owls\t")).toBe("Night Owls");
  });

  test("teamNameKey is case-insensitive", () => {
    expect(teamNameKey("Night  OWLS ")).toBe(teamNameKey("night owls"));
  });

  test("candidates fit the length limit", () => {
    expect(teamNameCandidates("Night Owls").slice(0, 2)).toEqual(["Night Owls 2", "Night Owls 3"]);
    for (const c of teamNameCandidates("x".repeat(32))) expect(c.length).toBeLessThanOrEqual(32);
  });

  test("team name schema", () => {
    expect(zTeamName.safeParse("  Lake   Otters ").data).toBe("Lake Otters");
    expect(zTeamName.safeParse("A").success).toBe(false);
    expect(zTeamName.safeParse("x".repeat(33)).success).toBe(false);
  });

  test("team code schema normalizes", () => {
    expect(zTeamCode.safeParse("k7q m4p").data).toBe("K7QM4P");
    expect(zTeamCode.safeParse("K7Q-M4").success).toBe(false);
  });
});
