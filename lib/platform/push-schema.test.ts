import { describe, expect, test } from "bun:test";
import { isAllowedPushEndpoint, pushSubscriptionSchema, pushUnsubscribeSchema } from "./push-schema";

const p256dh = Buffer.concat([Buffer.from([0x04]), Buffer.alloc(64, 7)]).toString("base64url");
const auth = Buffer.alloc(16, 3).toString("base64url");

function sub(over: Record<string, unknown> = {}) {
  return {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc:123",
    expirationTime: null,
    keys: { p256dh, auth },
    ...over,
  };
}

describe("isAllowedPushEndpoint", () => {
  test("accepts the browsers' push services", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QK4x")).toBe(true);
    expect(isAllowedPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
  });

  test("rejects anything else", () => {
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://evilfcm.googleapis.com.example/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://notfcm.googleapis.com.evil/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://localhost/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://10.0.0.1/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://user:pw@fcm.googleapis.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("not a url")).toBe(false);
  });
});

describe("pushSubscriptionSchema", () => {
  test("accepts a real-shaped subscription", () => {
    const result = pushSubscriptionSchema.safeParse(sub());
    expect(result.success).toBe(true);
  });

  test("accepts padded base64", () => {
    const padded = { p256dh: Buffer.from(p256dh, "base64url").toString("base64").replace(/\+/g, "-"), auth };
    expect(pushSubscriptionSchema.safeParse(sub({ keys: padded })).success).toBe(true);
  });

  test("rejects wrong key sizes", () => {
    const shortKey = Buffer.alloc(33, 4).toString("base64url");
    expect(pushSubscriptionSchema.safeParse(sub({ keys: { p256dh: shortKey, auth } })).success).toBe(false);
    const longAuth = Buffer.alloc(32, 1).toString("base64url");
    expect(pushSubscriptionSchema.safeParse(sub({ keys: { p256dh, auth: longAuth } })).success).toBe(false);
    const compressed = Buffer.concat([Buffer.from([0x02]), Buffer.alloc(64, 7)]).toString("base64url");
    expect(pushSubscriptionSchema.safeParse(sub({ keys: { p256dh: compressed, auth } })).success).toBe(false);
  });

  test("rejects missing keys and foreign endpoints", () => {
    expect(pushSubscriptionSchema.safeParse(sub({ keys: undefined })).success).toBe(false);
    const foreign = pushSubscriptionSchema.safeParse(sub({ endpoint: "https://example.com/hook" }));
    expect(foreign.success).toBe(false);
    expect(foreign.error?.issues[0]?.message).toBe("This browser's push service isn't supported.");
  });
});

test("pushUnsubscribeSchema only needs an endpoint", () => {
  expect(pushUnsubscribeSchema.safeParse({ endpoint: "https://fcm.googleapis.com/x" }).success).toBe(true);
  expect(pushUnsubscribeSchema.safeParse({}).success).toBe(false);
});
