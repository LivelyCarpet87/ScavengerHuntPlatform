import { describe, expect, test } from "bun:test";
import { attachmentDisposition, CSV_BOM, csvCell, csvRow, csvTime, defuseFormula, toCsv } from "./csv";

describe("csvCell", () => {
  test("leaves plain text alone", () => {
    expect(csvCell("Night Owls")).toBe("Night Owls");
    expect(csvCell("")).toBe("");
  });

  test("quotes fields with commas, quotes and line breaks (RFC 4180)", () => {
    expect(csvCell("Priya, Jonas")).toBe('"Priya, Jonas"');
    expect(csvCell('The "red" door')).toBe('"The ""red"" door"');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(csvCell("line one\r\nline two")).toBe('"line one\r\nline two"');
  });

  test("keeps surrounding spaces as part of the field", () => {
    expect(csvCell("  spaced  ")).toBe("  spaced  ");
  });

  test("writes empty fields for null, undefined and non-finite numbers", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
    expect(csvCell(Number.POSITIVE_INFINITY)).toBe("");
  });

  test("writes numbers as numbers, including negatives", () => {
    expect(csvCell(120)).toBe("120");
    expect(csvCell(-20)).toBe("-20");
    expect(csvCell(18.5)).toBe("18.5");
    expect(csvCell(0)).toBe("0");
  });

  test("writes booleans as yes/no and dates as ISO", () => {
    expect(csvCell(true)).toBe("yes");
    expect(csvCell(false)).toBe("no");
    expect(csvCell(new Date(Date.UTC(2026, 8, 27, 19, 5)))).toBe("2026-09-27T19:05:00.000Z");
    expect(csvCell(new Date(Number.NaN))).toBe("");
  });

  test("defuses text that spreadsheets would run as a formula", () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe('"\'=HYPERLINK(""http://evil"",""x"")"');
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-20")).toBe("'-20");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
    expect(csvCell("\rcmd")).toBe('"\'\rcmd"');
    expect(csvCell("  =1+1")).toBe("'  =1+1");
    expect(csvCell("＝1+1")).toBe("'＝1+1");
  });

  test("does not touch formula characters in the middle of text", () => {
    expect(csvCell("a=b")).toBe("a=b");
    expect(csvCell("team@example.com")).toBe("team@example.com");
    expect(defuseFormula("Rust Buckets - 2")).toBe("Rust Buckets - 2");
  });
});

describe("toCsv", () => {
  test("starts with a BOM and ends every record with CRLF", () => {
    const out = toCsv(
      ["team", "total"],
      [
        ["Night Owls", 610],
        ["Moss, Collective", -5],
      ],
    );
    expect(out.startsWith(CSV_BOM)).toBe(true);
    expect(out.slice(1)).toBe('team,total\r\nNight Owls,610\r\n"Moss, Collective",-5\r\n');
  });

  test("can omit the BOM", () => {
    expect(toCsv(["a"], [["1"]], { bom: false })).toBe("a\r\n1\r\n");
  });

  test("keeps emoji and accents intact", () => {
    expect(csvRow(["🦉 Night Owls", "Tomás"])).toBe("🦉 Night Owls,Tomás");
  });

  test("header-only document when there are no rows", () => {
    expect(toCsv(["rank", "team"], [], { bom: false })).toBe("rank,team\r\n");
  });
});

describe("attachmentDisposition", () => {
  test("includes an ASCII fallback and a UTF-8 filename", () => {
    expect(attachmentDisposition("campus-night-hunt-standings.csv")).toBe(
      "attachment; filename=\"campus-night-hunt-standings.csv\"; filename*=UTF-8''campus-night-hunt-standings.csv",
    );
    expect(attachmentDisposition('é "x".csv')).toBe(
      "attachment; filename=\"_ _x_.csv\"; filename*=UTF-8''%C3%A9%20%22x%22.csv",
    );
  });
});

describe("csvTime", () => {
  const evening = Date.UTC(2026, 8, 27, 19, 24, 52, 929);

  test("writes local time in the hunt's zone, the way spreadsheets read dates", () => {
    expect(csvTime(evening, "Asia/Shanghai")).toBe("2026-09-28 03:24:52");
    expect(csvTime(new Date(evening), "Europe/Berlin")).toBe("2026-09-27 21:24:52");
    expect(csvTime(evening, "UTC")).toBe("2026-09-27 19:24:52");
  });

  test("midnight is 00, not 24", () => {
    expect(csvTime(Date.UTC(2026, 8, 27, 16, 0, 5), "Asia/Shanghai")).toBe("2026-09-28 00:00:05");
  });

  test("blank for missing or invalid times, UTC for an unknown zone", () => {
    expect(csvTime(null, "UTC")).toBeNull();
    expect(csvTime(new Date(Number.NaN), "UTC")).toBeNull();
    expect(csvTime(evening, "Not/AZone")).toBe("2026-09-27 19:24:52");
  });

  test("stays a plain field in a row", () => {
    expect(csvRow([csvTime(evening, "Asia/Shanghai"), "Night Owls"])).toBe("2026-09-28 03:24:52,Night Owls");
  });
});
