/**
 * Random identifiers and human-facing codes. Uses Web Crypto so it runs in
 * Node, Bun, the browser and the service worker alike.
 */

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** No 0/O, 1/I/L — codes get read aloud and typed on phones. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomString(alphabet: string, length: number): string {
  // Rejection sampling keeps the distribution uniform.
  const max = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < max) out += alphabet[b % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/** Primary keys: 16 chars of base62 (~95 bits). */
export function newId(): string {
  return randomString(ID_ALPHABET, 16);
}

/** Long unguessable tokens (session cookies, invite links). */
export function newToken(length = 32): string {
  return randomString(ID_ALPHABET, length);
}

/** 6-digit numeric code — easy to type on a phone keypad. Used for hunt join codes. */
export function newJoinCode(): string {
  return randomString("0123456789", 6);
}

/** Unambiguous uppercase code, e.g. team codes ("K7QM4P") and checkpoint codes. */
export function newCode(length = 6): string {
  return randomString(CODE_ALPHABET, length);
}

/** Normalizes a code typed by a person: uppercase, drop spaces/dashes. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** "K7QM4P" -> "K7Q M4P" for display. */
export function formatCode(code: string): string {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  return code;
}

/** URL slug from a name: "Campus Hunt 2026!" -> "campus-hunt-2026". */
export function slugify(input: string): string {
  return (
    input
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "hunt"
  );
}
