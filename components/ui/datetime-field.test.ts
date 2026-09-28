import { describe, expect, test } from "bun:test";
import { fromLocalInput, toLocalInput } from "./datetime-field";

describe("date fields in a hunt's time zone", () => {
  test("show and read the hunt's wall clock, whatever the browser's zone", () => {
    // 20:10 UTC on 27 Sept is 16:10 in New York (EDT) and 04:10 next day in Shanghai.
    expect(toLocalInput("2026-09-27T20:10:00.000Z", "America/New_York")).toBe("2026-09-27T16:10");
    expect(toLocalInput("2026-09-27T20:10:00.000Z", "Asia/Shanghai")).toBe("2026-09-28T04:10");
    expect(fromLocalInput("2026-09-27T16:10", "America/New_York")).toBe("2026-09-27T20:10:00.000Z");
    expect(fromLocalInput("2026-09-28T04:10", "Asia/Shanghai")).toBe("2026-09-27T20:10:00.000Z");
  });

  test("follow daylight saving on either side of the change", () => {
    expect(fromLocalInput("2026-03-07T12:00", "America/New_York")).toBe("2026-03-07T17:00:00.000Z");
    expect(fromLocalInput("2026-03-09T12:00", "America/New_York")).toBe("2026-03-09T16:00:00.000Z");
    expect(fromLocalInput("2026-10-26T09:30", "Europe/London")).toBe("2026-10-26T09:30:00.000Z");
    expect(fromLocalInput("2026-10-24T09:30", "Europe/London")).toBe("2026-10-24T08:30:00.000Z");
  });

  test("round-trips every quarter hour across a DST week", () => {
    const start = Date.parse("2026-10-30T00:00:00Z");
    for (let t = start; t < start + 4 * 86_400_000; t += 15 * 60_000) {
      const iso = new Date(t).toISOString();
      const local = toLocalInput(iso, "Europe/Berlin");
      // The repeated hour when clocks go back maps to its first occurrence; everything else round-trips.
      expect([iso, new Date(t - 3_600_000).toISOString()]).toContain(fromLocalInput(local, "Europe/Berlin"));
    }
  });

  test("empty and unknown values", () => {
    expect(toLocalInput(null, "UTC")).toBe("");
    expect(fromLocalInput("", "UTC")).toBe("");
    expect(toLocalInput("2026-09-27T20:10:00.000Z", "UTC")).toBe("2026-09-27T20:10");
    // An unknown zone falls back to the browser's clock rather than failing.
    expect(fromLocalInput("2026-09-27T20:10", "Not/AZone")).toBe(new Date("2026-09-27T20:10").toISOString());
  });
});
