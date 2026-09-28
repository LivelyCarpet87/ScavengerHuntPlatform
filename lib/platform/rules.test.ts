import { describe, expect, test } from "bun:test";
import {
  firstName,
  firstParam,
  initials,
  inviteExpiry,
  inviteStatus,
  isPlausibleToken,
  safeNext,
  upgradedRole,
} from "./rules";

describe("safeNext", () => {
  test("keeps same-site relative paths", () => {
    expect(safeNext("/manage/abc")).toBe("/manage/abc");
    expect(safeNext("/invite/Tok3n?x=1#y")).toBe("/invite/Tok3n?x=1#y");
    expect(safeNext("/")).toBe("/");
  });

  test("rejects absolute and protocol-relative URLs", () => {
    expect(safeNext("https://evil.example")).toBe("/dashboard");
    expect(safeNext("//evil.example/path")).toBe("/dashboard");
    expect(safeNext("/\\evil.example")).toBe("/dashboard");
    expect(safeNext("/ok\\..\\evil")).toBe("/dashboard");
    expect(safeNext("javascript:alert(1)")).toBe("/dashboard");
    expect(safeNext("/a\nb")).toBe("/dashboard");
  });

  test("never sends people back to an auth page", () => {
    expect(safeNext("/login")).toBe("/dashboard");
    expect(safeNext("/login/")).toBe("/dashboard");
    expect(safeNext("/signup?invite=abc")).toBe("/dashboard");
    expect(safeNext("/setup")).toBe("/dashboard");
    expect(safeNext("/loginx")).toBe("/loginx");
  });

  test("falls back for missing values and honours a custom fallback", () => {
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext(null, "/")).toBe("/");
    expect(safeNext(42)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
  });
});

test("firstParam takes the first repeated value", () => {
  expect(firstParam(["/a", "/b"])).toBe("/a");
  expect(firstParam("/a")).toBe("/a");
  expect(firstParam(undefined)).toBeUndefined();
});

describe("inviteStatus", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  const base = { revokedAt: null, expiresAt: null, maxUses: null, uses: 0 };

  test("active by default", () => {
    expect(inviteStatus(base, now)).toBe("active");
    expect(inviteStatus({ ...base, maxUses: 3, uses: 2 }, now)).toBe("active");
    expect(inviteStatus({ ...base, expiresAt: new Date("2026-09-28T00:00:00Z") }, now)).toBe("active");
  });

  test("revoked wins over everything else", () => {
    expect(inviteStatus({ ...base, revokedAt: now, expiresAt: new Date(0), uses: 5, maxUses: 1 }, now)).toBe("revoked");
  });

  test("expired at the expiry instant", () => {
    expect(inviteStatus({ ...base, expiresAt: now }, now)).toBe("expired");
  });

  test("used up once uses reach the limit", () => {
    expect(inviteStatus({ ...base, maxUses: 1, uses: 1 }, now)).toBe("used");
    expect(inviteStatus({ ...base, maxUses: 0, uses: 0 }, now)).toBe("used");
  });
});

test("isPlausibleToken", () => {
  expect(isPlausibleToken("abcDEF0123456789abcDEF0123456789")).toBe(true);
  expect(isPlausibleToken("short")).toBe(false);
  expect(isPlausibleToken("has space in it")).toBe(false);
  expect(isPlausibleToken("../../etc/passwd")).toBe(false);
});

describe("upgradedRole", () => {
  test("new staff get the offered role", () => {
    expect(upgradedRole(null, "judge")).toBe("judge");
    expect(upgradedRole(undefined, "owner")).toBe("owner");
  });
  test("upgrades", () => {
    expect(upgradedRole("judge", "organizer")).toBe("organizer");
    expect(upgradedRole("organizer", "owner")).toBe("owner");
  });
  test("never downgrades or repeats", () => {
    expect(upgradedRole("owner", "judge")).toBeNull();
    expect(upgradedRole("organizer", "judge")).toBeNull();
    expect(upgradedRole("judge", "judge")).toBeNull();
  });
});

test("names", () => {
  expect(firstName("Alex Rivera")).toBe("Alex");
  expect(firstName("  Sam  ")).toBe("Sam");
  expect(initials("Alex Rivera")).toBe("AR");
  expect(initials("sam")).toBe("S");
  expect(initials("Mary Ann van der Berg")).toBe("MB");
  expect(initials("   ")).toBe("?");
  expect(initials("🦔 Hedgie")).toBe("🦔H");
  expect(initials("émile zola")).toBe("ÉZ");
});

test("inviteExpiry", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  expect(inviteExpiry("never", now)).toBeNull();
  expect(inviteExpiry("1d", now)?.toISOString()).toBe("2026-09-28T12:00:00.000Z");
  expect(inviteExpiry("7d", now)?.toISOString()).toBe("2026-10-04T12:00:00.000Z");
});
