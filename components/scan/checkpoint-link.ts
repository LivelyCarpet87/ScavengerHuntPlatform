import { normalizeCode } from "@/lib/ids";

/*
 * Checkpoint posters carry a QR code for /h/[slug]/cp/[CODE] (see links.checkpoint
 * in lib/url.ts) and print the code underneath for typing. These helpers read
 * either form. Pure, so the scanner, the task page and the upload API agree.
 */

export type CheckpointInput = { code: string; slug: string | null };

const CP_PATH = /^\/h\/([^/]+)\/cp\/([^/]+)\/?$/;

/**
 * Reads a scanned or typed checkpoint: a link ending in /h/[slug]/cp/[code]
 * (absolute or relative) or a bare code. Returns null for other links and for
 * text that can't be a code.
 */
export function parseCheckpointInput(input: string): CheckpointInput | null {
  const text = input.trim();
  if (!text) return null;
  const looksLikeLink = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) || text.startsWith("/");
  if (looksLikeLink) {
    let pathname: string;
    try {
      pathname = new URL(text, "https://scan.invalid").pathname;
    } catch {
      return null;
    }
    const match = CP_PATH.exec(pathname);
    if (!match) return null;
    const code = normalizeCode(safeDecode(match[2]));
    return code ? { code, slug: safeDecode(match[1]) } : null;
  }
  const code = normalizeCode(text);
  return code.length >= 3 && code.length <= 32 ? { code, slug: null } : null;
}

function safeDecode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}
