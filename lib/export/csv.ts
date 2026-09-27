/**
 * CSV writing per RFC 4180, hardened for spreadsheets.
 *
 * - Fields containing a comma, double quote, CR or LF are quoted; quotes are doubled.
 * - Records end with CRLF.
 * - Text that a spreadsheet would run as a formula (starting with = + - @, a
 *   tab or a carriage return, or their full-width forms) is prefixed with an
 *   apostrophe, so a team named "=HYPERLINK(…)" stays text. Numbers are written
 *   as numbers, so a −20 penalty is still −20 and not '-20.
 * - `toCsv` starts with a UTF-8 byte order mark so Excel reads emoji and
 *   accents correctly.
 */

export type CsvValue = string | number | boolean | Date | null | undefined;

export const CSV_BOM = "\uFEFF";
const CRLF = "\r\n";

// Leading whitespace doesn't stop some spreadsheets from evaluating a formula.
const FORMULA_START = /^[\t\r]|^\s*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/;
const NEEDS_QUOTES = /[",\r\n]/;

/** Neutralizes text a spreadsheet would treat as a formula. */
export function defuseFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

/** One CSV field. */
export function csvCell(value: CsvValue): string {
  let text: string;
  if (value == null) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    text = String(value);
  } else if (typeof value === "boolean") {
    text = value ? "yes" : "no";
  } else if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    text = value.toISOString();
  } else {
    text = defuseFormula(value);
  }
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One CSV record (without the line break). */
export function csvRow(values: readonly CsvValue[]): string {
  return values.map(csvCell).join(",");
}

/** A whole CSV document: BOM, header row, then one record per row, each ending in CRLF. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[], opts: { bom?: boolean } = {}) {
  const lines = [csvRow(header), ...rows.map(csvRow)];
  return `${opts.bom === false ? "" : CSV_BOM}${lines.join(CRLF)}${CRLF}`;
}

/** Content-Disposition value for a download, with an ASCII fallback and an RFC 5987 UTF-8 name. */
export function attachmentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
