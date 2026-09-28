/**
 * Idempotency keys for submissions, generated on the device. Uses
 * crypto.randomUUID where available; it only exists in secure contexts, so
 * phones testing over plain http on a LAN fall back to getRandomValues.
 * Safe in pages and the service worker.
 */
export function newClientId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      // Insecure context: fall through.
    }
  }
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
