/**
 * Formatting helpers shared by server and client code. Copy uses a real
 * minus sign (−) for negative points and tabular figures in the UI.
 */

const nf = new Intl.NumberFormat("en-US");

export function formatPoints(n: number): string {
  return n < 0 ? `−${nf.format(Math.abs(n))}` : nf.format(n);
}

/** "+120", "−15", "0" */
export function formatSigned(n: number): string {
  if (n > 0) return `+${nf.format(n)}`;
  if (n < 0) return `−${nf.format(Math.abs(n))}`;
  return "0";
}

/** 1 → "1st", 22 → "22nd", 13 → "13th" */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Split ordinal for typographic treatment: 2 → ["2", "nd"]. */
export function ordinalParts(n: number): [string, string] {
  const s = ordinal(n);
  return [String(n), s.slice(String(n).length)];
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${nf.format(n)} ${n === 1 ? one : many}`;
}

/** Countdown style: "2:05:09", "05:09", "0:09". Negative durations clamp to 0. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** Human duration: "2 h 5 min", "5 min", "40 s". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d > 0) return h > 0 ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return `${m} min`;
  return `${total} s`;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });

/** "just now", "3 min ago", "in 2 hr" */
export function formatRelative(date: Date | number, now: Date | number = Date.now()): string {
  const diff = (typeof date === "number" ? date : date.getTime()) - (typeof now === "number" ? now : now.getTime());
  const abs = Math.abs(diff);
  if (abs < 45_000) return "just now";
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}

/** "Sat 27 Sep, 14:30" in the given zone. */
export function formatDateTime(date: Date | number, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

/** "14:30" in the given zone. */
export function formatTime(date: Date | number, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(date);
}

/** "27 Sep 2026" in the given zone. */
export function formatDate(date: Date | number, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone }).format(date);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
