import { z } from "zod";

/*
 * Validation for browser push subscriptions posted to /api/push.
 *
 * The server later POSTs encrypted payloads to `endpoint`, so only HTTPS
 * endpoints on the browsers' own push services are accepted. That keeps a
 * crafted "subscription" from turning the server into a request relay into
 * your network. Add a host here if a browser you support uses another service.
 */
export const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge on Android, Samsung Internet, Opera, Brave
  "android.googleapis.com", // older Chrome builds
  "push.services.mozilla.com", // Firefox (updates.push.services.mozilla.com)
  "push.apple.com", // Safari on macOS and iOS (web.push.apple.com)
  "notify.windows.com", // Edge on Windows (wns2-*.notify.windows.com)
] as const;

/** Largest JSON body /api/push accepts. Real subscriptions are ~500 bytes. */
export const MAX_SUBSCRIPTION_BYTES = 4096;

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

function decodedLength(value: string): number {
  return Buffer.from(value, "base64url").length;
}

const endpointSchema = z
  .string({ message: "The subscription has no endpoint." })
  .max(2048, "The push endpoint is too long.")
  .refine(isAllowedPushEndpoint, "This browser's push service isn't supported.");

export const pushSubscriptionSchema = z.object({
  endpoint: endpointSchema,
  expirationTime: z.number().nullable().optional(),
  keys: z.object(
    {
      // An uncompressed P-256 public key: 65 bytes starting with 0x04.
      p256dh: z
        .string()
        .max(200)
        .regex(BASE64URL, "The subscription key is malformed.")
        .refine((v) => {
          const bytes = Buffer.from(v, "base64url");
          return bytes.length === 65 && bytes[0] === 0x04;
        }, "The subscription key is malformed."),
      // A 16-byte authentication secret.
      auth: z
        .string()
        .max(64)
        .regex(BASE64URL, "The subscription secret is malformed.")
        .refine((v) => decodedLength(v) === 16, "The subscription secret is malformed."),
    },
    { message: "The subscription has no keys." },
  ),
});

export type ValidPushSubscription = z.infer<typeof pushSubscriptionSchema>;

/** Unsubscribing only needs to name the endpoint; it is matched against this device's rows. */
export const pushUnsubscribeSchema = z.object({
  endpoint: z.string({ message: "The subscription has no endpoint." }).min(1).max(2048),
});
